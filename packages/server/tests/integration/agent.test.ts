import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  getPubClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
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
}));

// 모킹할 서버 객체 (vi.mock factory 내부에서도 참조할 수 있도록 별도 선언)
const mockServer = {
  id: 'server-uuid-1',
  name: '테스트 서버',
  hostname: 'test.example.com',
  apiKey: 'ward_test_api_key',
  status: 'online',
  lastSeenAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

// DB 모킹 — factory 내부에서 mockServer를 직접 참조하면 호이스팅 문제가 발생하므로
// limit의 반환값을 인라인으로 정의
vi.mock('../../src/db/index.js', () => {
  const inlineMockServer = {
    id: 'server-uuid-1',
    name: '테스트 서버',
    hostname: 'test.example.com',
    apiKey: 'ward_test_api_key',
    status: 'online',
    lastSeenAt: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([inlineMockServer]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: {
        id: 'id',
        name: 'name',
        hostname: 'hostname',
        status: 'status',
        apiKey: 'apiKey',
        lastSeenAt: 'lastSeenAt',
        createdAt: 'createdAt',
      },
      metrics: { serverId: 'serverId' },
      processes: { serverId: 'serverId' },
      logs: { serverId: 'serverId' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

const app = createApp();

describe('POST /api/agent/metrics', () => {
  it('유효한 메트릭을 저장해야 한다', async () => {
    const payload = {
      collectedAt: '2024-01-01T00:00:00Z',
      cpu: { usage: 45.5, loadAvg: [1.0, 0.8, 0.6] },
      memory: { total: 8000000000, used: 4000000000, free: 4000000000 },
      disk: { '/': { total: 100000000000, used: 50000000000, free: 50000000000 } },
      network: { eth0: { rx: 1000, tx: 500 } },
      processes: [{ pid: 1234, name: 'node', cpu: 2.5, memory: 100000 }],
    };

    const res = await request(app)
      .post('/api/agent/metrics')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('collectedAt이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/metrics')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send({ cpu: { usage: 50 } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('인증 헤더가 없으면 401을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/metrics')
      .send({ collectedAt: '2024-01-01T00:00:00Z' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/agent/logs', () => {
  it('유효한 로그 배치를 저장해야 한다', async () => {
    const payload = {
      logs: [
        { source: 'nginx', level: 'info', message: 'GET /index.html 200', loggedAt: '2024-01-01T00:00:00Z' },
        { source: 'nginx', level: 'error', message: '500 Internal Server Error', loggedAt: '2024-01-01T00:01:00Z' },
      ],
    };

    const res = await request(app)
      .post('/api/agent/logs')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it('logs 배열이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/logs')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send({});

    expect(res.status).toBe(400);
  });

  it('빈 logs 배열이면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/logs')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send({ logs: [] });

    expect(res.status).toBe(400);
  });

  it('인증 헤더가 없으면 401을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/logs')
      .send({ logs: [{ message: 'test', loggedAt: '2024-01-01T00:00:00Z' }] });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/agent/heartbeat', () => {
  it('heartbeat를 처리하고 서버 상태를 업데이트해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/heartbeat')
      .set('Authorization', 'Bearer ward_test_api_key')
      .send({ sentAt: '2024-01-01T00:00:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.serverId).toBe(mockServer.id);
  });

  it('인증 헤더가 없으면 401을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/heartbeat')
      .send({});

    expect(res.status).toBe(401);
  });
});

describe('GET /api/agent/config', () => {
  it('에이전트 설정을 반환해야 한다', async () => {
    const res = await request(app)
      .get('/api/agent/config')
      .set('Authorization', 'Bearer ward_test_api_key');

    expect(res.status).toBe(200);
    expect(res.body.serverId).toBe(mockServer.id);
    expect(res.body.config).toBeDefined();
    expect(res.body.config.metricsIntervalSec).toBeDefined();
  });

  it('인증 헤더가 없으면 401을 반환해야 한다', async () => {
    const res = await request(app)
      .get('/api/agent/config');

    expect(res.status).toBe(401);
  });
});
