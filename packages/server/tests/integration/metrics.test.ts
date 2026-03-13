import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// ws 모킹
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  WebSocket: { OPEN: 1 },
}));

// Redis 모킹
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

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockServer = { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockServer]),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: { id: 'id', name: 'name', hostname: 'hostname', status: 'status', lastSeenAt: 'lastSeenAt' },
      metrics: { serverId: 'server_id', collectedAt: 'collected_at' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
}));

// express-session 모킹: 인증된 세션
vi.mock('express-session', () => {
  const mockSession = vi.fn(() => (req: any, _res: any, next: any) => {
    req.session = {
      userId: 'user-uuid-1',
      save: vi.fn((cb: (err?: Error) => void) => cb()),
      destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    };
    next();
  });
  return { default: mockSession };
});

vi.mock('connect-redis', () => ({
  RedisStore: vi.fn().mockImplementation(() => ({})),
}));

const app = createApp();
const validServerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('GET /api/servers/:id/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 인증 없이 접근 시 401을 반환해야 한다', async () => {
    // sessionAuth를 직접 테스트
    const { sessionAuth } = await import('../../src/middleware/sessionAuth.js');
    const mockReq: any = { session: {} };
    const mockRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const mockNext = vi.fn();

    sessionAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('유효한 세션으로 메트릭 히스토리를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit)
      .mockResolvedValueOnce([{ id: validServerId }])
      .mockResolvedValueOnce([
        {
          id: 1,
          serverId: validServerId,
          collectedAt: new Date('2024-01-01T00:00:00Z'),
          cpuUsage: 45.5,
          memTotal: 8589934592,
          memUsed: 4294967296,
          diskUsage: null,
          networkIo: null,
          loadAvg: [1.0, 0.8, 0.6],
        },
      ]);

    const res = await request(app)
      .get(`/api/servers/${validServerId}/metrics`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('metrics');
    expect(Array.isArray(res.body.metrics)).toBe(true);
  });

  it('존재하지 않는 서버 조회 시 404를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.limit).mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/servers/${validServerId}/metrics`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('잘못된 UUID 형식의 id로 요청 시 400을 반환해야 한다', async () => {
    const res = await request(app)
      .get('/api/servers/invalid-id/metrics');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/servers/:id/status', () => {
  it('최신 서버 상태를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit)
      .mockResolvedValueOnce([
        {
          id: validServerId,
          name: '웹 서버',
          hostname: 'web-01',
          status: 'online',
          lastSeenAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/servers/${validServerId}/status`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('server');
    expect(res.body).toHaveProperty('latestMetric');
  });
});
