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

// DB 모킹
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockReturnThis(),
};

vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(() => mockDb),
  schema: {
    servers: {
      id: 'id',
      name: 'name',
      hostname: 'hostname',
      status: 'status',
      lastSeenAt: 'lastSeenAt',
      createdAt: 'createdAt',
      apiKey: 'apiKey',
      osName: 'osName',
      osVersion: 'osVersion',
      arch: 'arch',
    },
    logs: {
      id: 'id',
      serverId: 'serverId',
      source: 'source',
      loggedAt: 'loggedAt',
    },
    metrics: { serverId: 'serverId', collectedAt: 'collectedAt' },
    processes: {
      serverId: 'serverId',
      collectedAt: 'collectedAt',
      status: 'status',
    },
    services: {
      id: 'id',
      serverId: 'serverId',
      name: 'name',
      type: 'type',
      config: 'config',
      status: 'status',
      pid: 'pid',
      restartCount: 'restartCount',
      startedAt: 'startedAt',
      updatedAt: 'updatedAt',
      cpuUsage: 'cpuUsage',
      memUsage: 'memUsage',
    },
    users: { id: 'id', email: 'email', passwordHash: 'passwordHash', createdAt: 'createdAt' },
  },
  closePool: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
  and: vi.fn((...conditions) => ({ and: conditions })),
  isNotNull: vi.fn((field) => ({ isNotNull: field })),
  max: vi.fn((field) => ({ max: field })),
  count: vi.fn((field) => ({ count: field })),
}));

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

// 각 테스트 전에 mockDb를 기본 체인 상태로 초기화
function resetMockDb() {
  mockDb.select.mockReset().mockReturnThis();
  mockDb.from.mockReset().mockReturnThis();
  mockDb.where.mockReset().mockReturnThis();
  mockDb.groupBy.mockReset().mockReturnThis();
  mockDb.orderBy.mockReset().mockReturnThis();
  mockDb.innerJoin.mockReset().mockReturnThis();
  mockDb.limit.mockReset().mockResolvedValue([]);
  mockDb.insert.mockReset().mockReturnThis();
  mockDb.values.mockReset().mockReturnThis();
  mockDb.returning.mockReset().mockResolvedValue([]);
  mockDb.delete.mockReset().mockReturnThis();
}

describe('GET /api/services', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('등록된 서비스 목록을 flat 배열로 반환해야 한다', async () => {
    // select().from().innerJoin().orderBy() → 서비스 목록
    mockDb.orderBy.mockResolvedValueOnce([
      {
        id: 'svc-uuid-1',
        serverId: 'server-uuid-1',
        serverName: '웹 서버 1',
        serverHostname: 'web-01.example.com',
        serverStatus: 'online',
        name: 'ward-4000',
        type: 'exec',
        config: { command: 'node dist/index.js' },
        status: 'running',
        pid: 1234,
        restartCount: 0,
        startedAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        cpuUsage: 1.5,
        memUsage: 102400,
      },
    ]);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('services');
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0]).toMatchObject({
      serverId: 'server-uuid-1',
      serverName: '웹 서버 1',
      serverHostname: 'web-01.example.com',
      serverStatus: 'online',
      name: 'ward-4000',
      type: 'exec',
      status: 'running',
      pid: 1234,
    });
  });

  it('서비스가 없으면 빈 배열을 반환해야 한다', async () => {
    mockDb.orderBy.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('services');
    expect(res.body.services).toEqual([]);
  });

  it('여러 서버의 서비스를 함께 반환해야 한다', async () => {
    mockDb.orderBy.mockResolvedValueOnce([
      {
        id: 'svc-1', serverId: 'server-1', serverName: '서버 A', serverHostname: 'a.example.com',
        serverStatus: 'online', name: 'api', type: 'exec', config: {}, status: 'running',
        pid: 100, restartCount: 0, startedAt: null, updatedAt: new Date(), cpuUsage: null, memUsage: null,
      },
      {
        id: 'svc-2', serverId: 'server-2', serverName: '서버 B', serverHostname: 'b.example.com',
        serverStatus: 'online', name: 'worker', type: 'exec', config: {}, status: 'stopped',
        pid: null, restartCount: 2, startedAt: null, updatedAt: new Date(), cpuUsage: null, memUsage: null,
      },
    ]);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(2);
    expect(res.body.services[0].serverName).toBe('서버 A');
    expect(res.body.services[1].serverName).toBe('서버 B');
  });

  it('cpuUsage, memUsage가 null이면 null로 반환해야 한다', async () => {
    mockDb.orderBy.mockResolvedValueOnce([
      {
        id: 'svc-1', serverId: 'server-1', serverName: '서버 A', serverHostname: 'a.example.com',
        serverStatus: 'online', name: 'api', type: 'exec', config: {}, status: 'running',
        pid: 100, restartCount: 0, startedAt: null, updatedAt: new Date(), cpuUsage: null, memUsage: null,
      },
    ]);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body.services[0].cpuUsage).toBeNull();
    expect(res.body.services[0].memUsage).toBeNull();
  });

  it('startedAt이 Date이면 ISO 문자열로 변환해야 한다', async () => {
    const startedAt = new Date('2024-06-01T09:00:00Z');
    mockDb.orderBy.mockResolvedValueOnce([
      {
        id: 'svc-1', serverId: 'server-1', serverName: '서버 A', serverHostname: 'a.example.com',
        serverStatus: 'online', name: 'api', type: 'exec', config: {}, status: 'running',
        pid: 100, restartCount: 0, startedAt, updatedAt: new Date('2024-06-01T09:00:00Z'),
        cpuUsage: 0.5, memUsage: 51200,
      },
    ]);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body.services[0].startedAt).toBe('2024-06-01T09:00:00.000Z');
  });
});

describe('GET /api/servers/:id/processes', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('특정 서버의 최신 프로세스 목록을 반환해야 한다', async () => {
    // 쿼리 순서:
    // 1. select().from().where().limit(1)           → 서버 존재 확인 (limit 첫번째)
    // 2. select().from().where().orderBy().limit(1) → collectedAt    (limit 두번째)
    // 3. select().from().where().limit(10000)        → 프로세스 목록  (limit 세번째)

    mockDb.limit
      .mockResolvedValueOnce([{ id: 'server-uuid-1' }])                          // 1번
      .mockResolvedValueOnce([{ collectedAt: new Date('2024-01-01T12:00:00Z') }]) // 2번
      .mockResolvedValueOnce([                                                    // 3번
        { id: 1, serverId: 'server-uuid-1', pid: 1234, name: 'node', cpuUsage: 1.5, memUsage: 102400, status: 'running' },
      ]);

    const res = await request(app).get('/api/servers/server-uuid-1/processes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('processes');
    expect(res.body).toHaveProperty('collectedAt');
    expect(Array.isArray(res.body.processes)).toBe(true);
  });

  it('존재하지 않는 서버는 404를 반환해야 한다', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/servers/nonexistent-uuid/processes');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('서버는 있지만 프로세스가 없으면 빈 배열을 반환해야 한다', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ id: 'server-uuid-1' }]) // 서버 확인
      .mockResolvedValueOnce([]);                        // collectedAt 없음 → 빈 배열

    const res = await request(app).get('/api/servers/server-uuid-1/processes');

    expect(res.status).toBe(200);
    expect(res.body.processes).toEqual([]);
    expect(res.body.collectedAt).toBeNull();
  });
});
