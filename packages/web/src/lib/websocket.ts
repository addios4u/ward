// WebSocket 클라이언트
import type { WsMessage } from '@/types';

type MessageHandler = (msg: WsMessage) => void;

// WebSocket 연결 관리 클래스
export class WardWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(url?: string) {
    const serverUrl =
      typeof window !== 'undefined'
        ? (process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000')
        : 'http://localhost:4000';
    // http -> ws, https -> wss 변환
    this.url = url ?? serverUrl.replace(/^http/, 'ws') + '/ws';
  }

  // 연결 시작
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    // WebSocket은 쿠키를 자동으로 전송하므로 별도 인증 헤더 불필요
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket 연결됨');
      // 재연결 타이머 취소
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        this.handlers.forEach((handler) => handler(msg));
      } catch {
        console.error('WebSocket 메시지 파싱 오류');
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket 연결 종료');
      if (this.shouldReconnect) {
        // 3초 후 재연결 시도
        this.reconnectTimer = setTimeout(() => {
          console.log('WebSocket 재연결 시도...');
          this.connect();
        }, 3000);
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket 오류:', err);
    };
  }

  // 연결 종료
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  // 메시지 전송
  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // 채널 구독
  subscribe(channel: 'metrics' | 'logs' | 'status', serverId: string): void {
    this.send({ type: 'subscribe', channel, serverId });
  }

  // 메시지 핸들러 등록
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    // 핸들러 제거 함수 반환
    return () => {
      this.handlers.delete(handler);
    };
  }

  // 연결 상태 확인
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// 전역 WebSocket 인스턴스 (싱글톤)
let wsInstance: WardWebSocket | null = null;

export function getWebSocket(): WardWebSocket {
  if (!wsInstance) {
    wsInstance = new WardWebSocket();
  }
  return wsInstance;
}
