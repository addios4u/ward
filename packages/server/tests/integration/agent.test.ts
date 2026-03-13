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

// DB 모킹 — where는 체이닝(limit 호출)과 직접 await 모두 지원하기 위해
// Promise이면서 limit 메서드도 가진 객체를 반환
vi.mock('../../src/db/index.js', () => {
  const defaultServer = {
    id: 'server-uuid-1',
    name: '테스트 서버',
    hostname: 'test.example.com',
    groupName: null,
    publicIp: null,
    country: null,
    city: null,
    isp: null,
    status: 'online',
    lastSeenAt: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  // limit mock: 기본적으로 서버를 반환
  const limitFn = vi.fn().mockResolvedValue([defaultServer]);

  // returning mock: 기본적으로 빈 배열 반환
  const returningFn = vi.fn().mockResolvedValue([{ id: 'server-uuid-new' }]);

  // where mock: limit/returning 체이닝할 수 있는 Promise-like 객체 반환
  // update().set().where() → 직접 await
  // select().from().where().limit() → limit 호출
  // delete().where().returning() → returning 호출
  const makeWhereResult = (resolveValue: any[]) => {
    const p = Promise.resolve(resolveValue) as any;
    p.limit = limitFn;
    p.returning = returningFn;
    return p;
  };

  const whereFn = vi.fn(() => makeWhereResult([]));

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: whereFn,
    limit: limitFn,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: returningFn,
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
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

const defaultServer = {
  id: 'server-uuid-1',
  name: '테스트 서버',
  hostname: 'test.example.com',
  groupName: null,
  publicIp: null,
  country: null,
  city: null,
  isp: null,
  status: 'online',
  lastSeenAt: new Date('2024-01-01T00:00:00Z'),
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

// 각 테스트 전 mock 기본값 복원
beforeEach(async () => {
  const { getDb } = await import('../../src/db/index.js');
  const mockDb = getDb();

  const makeWhereResult = (resolveValue: any[]) => {
    const p = Promise.resolve(resolveValue) as any;
    p.limit = vi.mocked(mockDb.limit);
    p.returning = vi.mocked(mockDb.returning);
    return p;
  };

  // limit 기본값: 서버 반환 (serverIdentify 미들웨어용)
  vi.mocked(mockDb.limit).mockResolvedValue([defaultServer]);
  // where 기본값: 빈 배열 resolve + limit/returning 체이닝 지원
  vi.mocked(mockDb.where).mockImplementation(() => makeWhereResult([]));
  vi.mocked(mockDb.returning).mockResolvedValue([{ id: 'server-uuid-new' }]);
});

// register/unregister 테스트
describe('POST /api/agent/register', () => {
  it('hostname으로 등록하면 serverId를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    const makeWhereResult = (resolveValue: any[]) => {
      const p = Promise.resolve(resolveValue) as any;
      p.limit = vi.mocked(mockDb.limit);
      return p;
    };

    // 기존 서버 없음: limit → []
    vi.mocked(mockDb.limit).mockResolvedValueOnce([]);
    vi.mocked(mockDb.where).mockImplementationOnce(() => makeWhereResult([]));
    vi.mocked(mockDb.returning).mockResolvedValueOnce([{ id: 'server-uuid-new' }]);

    const res = await request(app)
      .post('/api/agent/register')
      .send({ hostname: 'new-server.example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('serverId');
  });

  it('hostname이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('동일 hostname 재등록 시 기존 serverId를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    const makeWhereResult = (resolveValue: any[]) => {
      const p = Promise.resolve(resolveValue) as any;
      p.limit = vi.mocked(mockDb.limit);
      return p;
    };

    const existingServer = { id: 'server-uuid-existing' };
    // 첫 번째 where (select 체인): limit이 기존 서버 반환
    vi.mocked(mockDb.limit).mockResolvedValueOnce([existingServer]);
    vi.mocked(mockDb.where).mockImplementationOnce(() => makeWhereResult([]));
    // 두 번째 where (update 체인): 직접 resolve
    vi.mocked(mockDb.where).mockImplementationOnce(() => makeWhereResult([]));

    const res = await request(app)
      .post('/api/agent/register')
      .send({ hostname: 'existing.example.com' });

    expect(res.status).toBe(200);
    expect(res.body.serverId).toBe('server-uuid-existing');
  });

  it('groupName을 포함해서 등록할 수 있어야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    const makeWhereResult = (resolveValue: any[]) => {
      const p = Promise.resolve(resolveValue) as any;
      p.limit = vi.mocked(mockDb.limit);
      return p;
    };

    vi.mocked(mockDb.limit).mockResolvedValueOnce([]);
    vi.mocked(mockDb.where).mockImplementationOnce(() => makeWhereResult([]));
    vi.mocked(mockDb.returning).mockResolvedValueOnce([{ id: 'server-uuid-group' }]);

    const res = await request(app)
      .post('/api/agent/register')
      .send({ hostname: 'grouped.example.com', groupName: 'production' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('serverId');
  });
});

describe('DELETE /api/agent/unregister', () => {
  it('x-ward-server-id 헤더로 서버를 삭제해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.returning).mockResolvedValueOnce([{ id: 'server-uuid-1' }]);

    const res = await request(app)
      .delete('/api/agent/unregister')
      .set('x-ward-server-id', 'server-uuid-1');

    expect(res.status).toBe(204);
  });

  it('x-ward-server-id 헤더가 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .delete('/api/agent/unregister');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/agent/metrics', () => {
  it('x-ward-server-id 헤더로 메트릭을 전송해야 한다', async () => {
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
      .set('x-ward-server-id', 'server-uuid-1')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('x-ward-server-id 헤더가 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/metrics')
      .send({ collectedAt: '2024-01-01T00:00:00Z' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/agent/heartbeat', () => {
  it('ipInfo를 포함한 heartbeat를 처리해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/heartbeat')
      .set('x-ward-server-id', 'server-uuid-1')
      .send({
        sentAt: '2024-01-01T00:00:00Z',
        hostname: 'test.example.com',
        ipInfo: {
          ip: '1.2.3.4',
          country: 'Korea',
          city: 'Seoul',
          isp: 'KT',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.serverId).toBe('server-uuid-1');
  });

  it('x-ward-server-id 헤더가 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/agent/heartbeat')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/agent/logs', () => {
  it('x-ward-server-id 헤더로 로그를 전송해야 한다', async () => {
    const payload = {
      logs: [
        { source: 'nginx', level: 'info', message: 'GET /index.html 200', loggedAt: '2024-01-01T00:00:00Z' },
      ],
    };

    const res = await request(app)
      .post('/api/agent/logs')
      .set('x-ward-server-id', 'server-uuid-1')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});
