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
    call: vi.fn().mockResolvedValue('OK'),
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
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn()
      .mockResolvedValueOnce([
        {
          id: 'uuid-1',
          name: '웹 서버 1',
          hostname: 'web-01.example.com',
          groupName: 'production',
          publicIp: '1.2.3.4',
          country: 'Korea',
          city: 'Seoul',
          isp: 'KT',
          status: 'online',
          lastSeenAt: new Date('2024-01-01T00:00:00Z'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ])
      .mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: 'uuid-new',
        name: '새 서버',
        hostname: 'new.example.com',
        groupName: null,
        publicIp: null,
        country: null,
        city: null,
        isp: null,
        status: 'unknown',
        createdAt: new Date('2024-01-02T00:00:00Z'),
      },
    ]),
    delete: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: {
        id: 'id',
        name: 'name',
        hostname: 'hostname',
        groupName: 'groupName',
        publicIp: 'publicIp',
        country: 'country',
        city: 'city',
        isp: 'isp',
        status: 'status',
        lastSeenAt: 'lastSeenAt',
        createdAt: 'createdAt',
      },
      metrics: { serverId: 'serverId', collectedAt: 'collectedAt' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
}));

// express-session 모킹: userId가 설정된 세션 (인증됨)
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

describe('GET /api/servers', () => {
  it('인증된 사용자의 서버 목록을 반환해야 한다', async () => {
    const res = await request(app).get('/api/servers');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('servers');
    expect(Array.isArray(res.body.servers)).toBe(true);
  });

  it('서버 목록에 groupName과 hostname이 포함되어야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.orderBy).mockResolvedValueOnce([
      {
        id: 'uuid-1',
        name: '웹 서버 1',
        hostname: 'web-01.example.com',
        groupName: 'production',
        publicIp: '1.2.3.4',
        country: 'Korea',
        city: 'Seoul',
        isp: 'KT',
        status: 'online',
        lastSeenAt: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const res = await request(app).get('/api/servers');

    expect(res.status).toBe(200);
    const servers = res.body.servers;
    expect(Array.isArray(servers)).toBe(true);
    if (servers.length > 0) {
      expect(servers[0]).toHaveProperty('hostname');
      expect(servers[0]).toHaveProperty('groupName');
    }
  });
});

describe('DELETE /api/servers/:id', () => {
  it('존재하지 않는 서버 삭제 시 404를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.returning).mockResolvedValueOnce([]);

    const res = await request(app).delete('/api/servers/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('서버 삭제 성공 시 204를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.returning).mockResolvedValueOnce([{ id: 'uuid-1' }]);

    const res = await request(app).delete('/api/servers/uuid-1');

    expect(res.status).toBe(204);
  });
});

describe('미인증 요청 → 401', () => {
  it('세션 없이 GET /api/servers 요청 시 401을 반환해야 한다', async () => {
    // sessionAuth는 req.session.userId가 없으면 401 반환
    const { sessionAuth } = await import('../../src/middleware/sessionAuth.js');
    const mockReq: any = { session: {} };
    const mockRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const mockNext = vi.fn();

    sessionAuth(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
