import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { getSubClient, REDIS_CHANNELS } from '../lib/redis.js';

// 클라이언트 구독 정보
interface ClientSubscription {
  ws: WebSocket;
  channels: Set<string>;
}

// 클라이언트가 보내는 구독 요청 메시지 형식
interface SubscribeMessage {
  type: 'subscribe';
  channel: 'metrics' | 'logs' | 'status';
  serverId?: string;
}

// 서버 → 클라이언트 메시지 형식
interface WsOutboundMessage {
  type: 'metrics' | 'logs' | 'status';
  serverId?: string;
  data?: unknown;
  status?: string;
}

/**
 * WebSocket 관리자
 * Redis Pub/Sub 메시지를 WebSocket 클라이언트에 실시간 브로드캐스트
 */
export class WsManager {
  private wss: WebSocketServer;
  // Redis 채널 → 구독 중인 WebSocket 클라이언트 세트
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private redisListening = false;

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.setupWebSocket();
    this.setupRedisSubscriber();
  }

  /** WebSocket 연결 이벤트 설정 */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      console.log('WebSocket 클라이언트 연결됨');

      this.clients.set(ws, { ws, channels: new Set() });

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        console.log('WebSocket 클라이언트 연결 종료');
        this.removeClient(ws);
      });

      ws.on('error', (err: Error) => {
        console.error('WebSocket 클라이언트 오류:', err.message);
        this.removeClient(ws);
      });
    });

    this.wss.on('error', (err: Error) => {
      console.error('WebSocket 서버 오류:', err.message);
    });
  }

  /** 클라이언트 메시지 처리 */
  private handleMessage(ws: WebSocket, data: Buffer): void {
    try {
      const msg = JSON.parse(data.toString()) as SubscribeMessage;

      if (msg.type !== 'subscribe') {
        return;
      }

      let redisChannel: string;

      if (msg.channel === 'metrics' && msg.serverId) {
        redisChannel = REDIS_CHANNELS.metrics(msg.serverId);
      } else if (msg.channel === 'logs' && msg.serverId) {
        redisChannel = REDIS_CHANNELS.logs(msg.serverId);
      } else if (msg.channel === 'status') {
        redisChannel = REDIS_CHANNELS.serverStatus;
      } else {
        console.warn('WebSocket: 잘못된 구독 요청:', msg);
        return;
      }

      this.subscribeClient(ws, redisChannel);
      console.log(`WebSocket 클라이언트가 채널 구독: ${redisChannel}`);
    } catch (err) {
      console.error('WebSocket 메시지 파싱 오류:', (err as Error).message);
    }
  }

  /** 클라이언트를 Redis 채널에 구독 등록 */
  private subscribeClient(ws: WebSocket, redisChannel: string): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    // 클라이언트 구독 목록에 추가
    clientInfo.channels.add(redisChannel);

    // 채널 → 클라이언트 매핑 추가
    if (!this.subscriptions.has(redisChannel)) {
      this.subscriptions.set(redisChannel, new Set());
    }
    this.subscriptions.get(redisChannel)!.add(ws);

    // Redis 구독이 아직 없으면 시작
    this.ensureRedisSubscribed(redisChannel);
  }

  /** Redis 채널 구독 보장 */
  private ensureRedisSubscribed(redisChannel: string): void {
    try {
      const sub = getSubClient();
      sub.subscribe(redisChannel, (err) => {
        if (err) {
          console.error(`Redis 채널 구독 실패 (${redisChannel}):`, err.message);
        }
      });
    } catch (err) {
      console.error('Redis 구독 클라이언트 오류:', (err as Error).message);
    }
  }

  /** Redis 메시지 수신 → WebSocket 브로드캐스트 설정 */
  private setupRedisSubscriber(): void {
    if (this.redisListening) return;
    this.redisListening = true;

    try {
      const sub = getSubClient();

      sub.on('message', (channel: string, message: string) => {
        this.broadcastToChannel(channel, message);
      });

      sub.on('error', (err: Error) => {
        console.error('Redis 구독 클라이언트 오류 (WsManager):', err.message);
      });
    } catch (err) {
      console.error('Redis 구독 초기화 실패:', (err as Error).message);
    }
  }

  /** Redis 채널 메시지를 구독 중인 WebSocket 클라이언트에 브로드캐스트 */
  private broadcastToChannel(redisChannel: string, message: string): void {
    const clients = this.subscriptions.get(redisChannel);
    if (!clients || clients.size === 0) return;

    const outbound = this.buildOutboundMessage(redisChannel, message);
    if (!outbound) return;

    const payload = JSON.stringify(outbound);

    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /** Redis 채널명을 기반으로 WebSocket 아웃바운드 메시지 생성 */
  private buildOutboundMessage(redisChannel: string, message: string): WsOutboundMessage | null {
    try {
      // ward:metrics:{serverId}
      const metricsMatch = redisChannel.match(/^ward:metrics:(.+)$/);
      if (metricsMatch) {
        return {
          type: 'metrics',
          serverId: metricsMatch[1],
          data: JSON.parse(message),
        };
      }

      // ward:logs:{serverId}
      const logsMatch = redisChannel.match(/^ward:logs:(.+)$/);
      if (logsMatch) {
        return {
          type: 'logs',
          serverId: logsMatch[1],
          data: JSON.parse(message),
        };
      }

      // ward:server:status
      if (redisChannel === 'ward:server:status') {
        const parsed = JSON.parse(message) as { serverId: string; status: string };
        return {
          type: 'status',
          serverId: parsed.serverId,
          status: parsed.status,
        };
      }
    } catch (err) {
      console.error('WebSocket 아웃바운드 메시지 생성 오류:', (err as Error).message);
    }

    return null;
  }

  /** WebSocket 클라이언트 연결 해제 시 정리 */
  private removeClient(ws: WebSocket): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    // 채널 → 클라이언트 매핑에서 제거
    clientInfo.channels.forEach((channel) => {
      const channelClients = this.subscriptions.get(channel);
      if (channelClients) {
        channelClients.delete(ws);
        if (channelClients.size === 0) {
          this.subscriptions.delete(channel);
        }
      }
    });

    this.clients.delete(ws);
  }

  /** WebSocket 서버 종료 */
  close(): void {
    this.wss.close(() => {
      console.log('WebSocket 서버 종료');
    });
  }
}
