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

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockLogs = [
    {
      id: 1,
      serverId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      source: 'nginx',
      level: 'error',
      message: '500 Internal Server Error',
      loggedAt: new Date('2024-01-01T00:00:00Z'),
      createdAt: new Date('2024-01-01T00:00:00Z'),
    },
  ];

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(mockLogs),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: { id: 'id' },
      logs: { serverId: 'server_id', level: 'level', loggedAt: 'logged_at' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
  and: vi.fn((...conditions) => conditions),
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

describe('GET /api/servers/:id/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 인증 없이 접근 시 401을 반환해야 한다', async () => {
    const { sessionAuth } = await import('../../src/middleware/sessionAuth.js');
    const mockReq: any = { session: {} };
    const mockRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const mockNext = vi.fn();

    sessionAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('유효한 세션으로 로그 목록을 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit).mockImplementationOnce(() => ({
      ...mockDb,
      then: (resolve: (value: unknown[]) => void) => resolve([{ id: validServerId }]),
    } as unknown as typeof mockDb));

    vi.mocked(mockDb.offset).mockResolvedValueOnce([
      {
        id: 1,
        serverId: validServerId,
        source: 'nginx',
        level: 'error',
        message: '500 Internal Server Error',
        loggedAt: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const res = await request(app)
      .get(`/api/servers/${validServerId}/logs`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it('잘못된 UUID 형식의 id로 요청 시 400을 반환해야 한다', async () => {
    const res = await request(app)
      .get('/api/servers/invalid-id/logs');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('level 쿼리 파라미터로 필터링할 수 있어야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit).mockImplementationOnce(() => ({
      ...mockDb,
      then: (resolve: (value: unknown[]) => void) => resolve([{ id: validServerId }]),
    } as unknown as typeof mockDb));

    vi.mocked(mockDb.offset).mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/api/servers/${validServerId}/logs?level=error`);

    expect(res.status).toBe(200);
  });
});
