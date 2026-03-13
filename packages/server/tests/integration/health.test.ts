import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// ws 모킹 (WsManager가 app.ts에서 import됨)
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  WebSocket: { OPEN: 1 },
}));

// Redis 모킹 (graceful degradation)
vi.mock('../../src/lib/redis.js', () => ({
  safeGet: vi.fn().mockResolvedValue(null),
  safeSet: vi.fn().mockResolvedValue(undefined),
  safePublish: vi.fn().mockResolvedValue(undefined),
  getSubClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    subscribe: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  }),
  getRateLimitClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    evalsha: vi.fn().mockResolvedValue([1, Math.floor(Date.now() / 1000) + 60]),
    script: vi.fn().mockResolvedValue("sha1234"),
    eval: vi.fn().mockResolvedValue([1, Math.floor(Date.now() / 1000) + 60]),
  }),
  getPubClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
    evalsha: vi.fn().mockResolvedValue([1, Math.floor(Date.now() / 1000) + 60]),
    script: vi.fn().mockResolvedValue("sha1234"),
    eval: vi.fn().mockResolvedValue(0),
  }),
  REDIS_CHANNELS: {
    metrics: (id: string) => `ward:metrics:${id}`,
    logs: (id: string) => `ward:logs:${id}`,
    serverStatus: 'ward:server:status',
  },
  REDIS_KEYS: {
    latestMetrics: (id: string) => `ward:latest:metrics:${id}`,
    latestStatus: (id: string) => `ward:latest:status:${id}`,
  },
  closeRedis: vi.fn().mockResolvedValue(undefined),
  getSessionStoreClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    expiretime: vi.fn().mockResolvedValue(-1),
    mget: vi.fn().mockResolvedValue([]),
    scan: vi.fn().mockResolvedValue({ cursor: '0', keys: [] }),
  }),
}));

const app = createApp();

describe('GET /health', () => {
  it('200 상태코드와 ok 상태를 반환해야 한다', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ward-server');
    expect(res.body.timestamp).toBeDefined();
  });
});
