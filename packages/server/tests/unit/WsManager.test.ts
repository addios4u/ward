import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// WebSocket 모킹
const mockWs = {
  readyState: 1, // WebSocket.OPEN
  send: vi.fn(),
  on: vi.fn(),
};

const mockWss = new EventEmitter() as EventEmitter & {
  close: ReturnType<typeof vi.fn>;
};
mockWss.close = vi.fn((cb?: () => void) => { cb?.(); });

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => mockWss),
  WebSocket: {
    OPEN: 1,
  },
}));

// Redis 구독 클라이언트 모킹
const mockSubEmitter = new EventEmitter() as EventEmitter & {
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
mockSubEmitter.subscribe = vi.fn((_channel: string, cb?: (err: Error | null) => void) => { cb?.(null); });
mockSubEmitter.connect = vi.fn().mockResolvedValue(undefined);
mockSubEmitter.quit = vi.fn().mockResolvedValue('OK');
mockSubEmitter.disconnect = vi.fn();

// EventEmitter의 on을 오버라이드하여 추적 가능하게
const originalOn = mockSubEmitter.on.bind(mockSubEmitter);
mockSubEmitter.on = vi.fn((...args: Parameters<typeof originalOn>) => {
  return originalOn(...args);
});

vi.mock('../../src/lib/redis.js', () => ({
  getSubClient: vi.fn().mockReturnValue(mockSubEmitter),
  REDIS_CHANNELS: {
    metrics: (serverId: string) => `ward:metrics:${serverId}`,
    logs: (serverId: string) => `ward:logs:${serverId}`,
    serverStatus: 'ward:server:status',
  },
}));

describe('WsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    mockSubEmitter.removeAllListeners('message');
  });

  it('HTTP 서버에 WebSocket 서버를 연결해야 한다', async () => {
    const { WebSocketServer } = await import('ws');
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const mockHttpServer = {} as import('http').Server;

    new WsManager(mockHttpServer);

    expect(WebSocketServer).toHaveBeenCalledWith({
      server: mockHttpServer,
      path: '/ws',
    });
  });

  it('Redis 구독 클라이언트의 message 이벤트를 등록해야 한다', async () => {
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const mockHttpServer = {} as import('http').Server;

    new WsManager(mockHttpServer);

    // message 이벤트 리스너가 등록되어야 함
    expect(mockSubEmitter.listenerCount('message')).toBeGreaterThan(0);
  });

  it('클라이언트가 metrics 구독 요청 시 Redis 채널을 구독해야 한다', async () => {
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const { getSubClient } = await import('../../src/lib/redis.js');
    const mockHttpServer = {} as import('http').Server;

    new WsManager(mockHttpServer);

    // WebSocket 연결 이벤트 시뮬레이션
    const wsEventEmitter = new EventEmitter();
    const mockWsClient = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: (event: string, listener: (...args: unknown[]) => void) => wsEventEmitter.on(event, listener),
    };

    mockWss.emit('connection', mockWsClient, { headers: { cookie: 'connect.sid=test-session-id' } });

    // 구독 메시지 시뮬레이션
    const subscribeMsg = JSON.stringify({
      type: 'subscribe',
      channel: 'metrics',
      serverId: 'server-1',
    });
    wsEventEmitter.emit('message', Buffer.from(subscribeMsg));

    const subClient = getSubClient();
    expect(subClient.subscribe).toHaveBeenCalledWith(
      'ward:metrics:server-1',
      expect.any(Function)
    );
  });

  it('Redis 메시지 수신 시 해당 채널 구독 클라이언트에 브로드캐스트해야 한다', async () => {
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const mockHttpServer = {} as import('http').Server;

    new WsManager(mockHttpServer);

    // WebSocket 클라이언트 연결
    const wsEventEmitter = new EventEmitter();
    const mockWsClient = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: (event: string, listener: (...args: unknown[]) => void) => wsEventEmitter.on(event, listener),
    };

    mockWss.emit('connection', mockWsClient, { headers: { cookie: 'connect.sid=test-session-id' } });

    // metrics 채널 구독
    wsEventEmitter.emit('message', Buffer.from(JSON.stringify({
      type: 'subscribe',
      channel: 'metrics',
      serverId: 'server-1',
    })));

    // Redis에서 메트릭 메시지 수신 시뮬레이션
    const metricsData = JSON.stringify({ cpu: 45.5 });
    mockSubEmitter.emit('message', 'ward:metrics:server-1', metricsData);

    // WebSocket 클라이언트에 메시지 전송 확인
    expect(mockWsClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'metrics',
        serverId: 'server-1',
        data: { cpu: 45.5 },
      })
    );
  });

  it('Redis status 메시지 수신 시 올바른 형식으로 브로드캐스트해야 한다', async () => {
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const mockHttpServer = {} as import('http').Server;

    new WsManager(mockHttpServer);

    const wsEventEmitter = new EventEmitter();
    const mockWsClient = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: (event: string, listener: (...args: unknown[]) => void) => wsEventEmitter.on(event, listener),
    };

    mockWss.emit('connection', mockWsClient, { headers: { cookie: 'connect.sid=test-session-id' } });

    // status 채널 구독
    wsEventEmitter.emit('message', Buffer.from(JSON.stringify({
      type: 'subscribe',
      channel: 'status',
    })));

    // Redis에서 상태 메시지 수신 시뮬레이션
    const statusData = JSON.stringify({ serverId: 'server-1', status: 'online' });
    mockSubEmitter.emit('message', 'ward:server:status', statusData);

    expect(mockWsClient.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'status',
        serverId: 'server-1',
        status: 'online',
      })
    );
  });

  it('close() 호출 시 WebSocket 서버가 종료되어야 한다', async () => {
    const { WsManager } = await import('../../src/websocket/WsManager.js');
    const mockHttpServer = {} as import('http').Server;

    const manager = new WsManager(mockHttpServer);
    manager.close();

    expect(mockWss.close).toHaveBeenCalled();
  });
});
