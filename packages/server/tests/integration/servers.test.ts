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

const mockServers = [
  {
    id: 'uuid-1',
    name: '웹 서버 1',
    hostname: 'web-01.example.com',
    status: 'online',
    lastSeenAt: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
];

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // 첫 번째 orderBy → 서버 목록 resolve, 이후 → this 반환 (체이닝용)
    orderBy: vi.fn()
      .mockResolvedValueOnce([
        {
          id: 'uuid-1',
          name: '웹 서버 1',
          hostname: 'web-01.example.com',
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
        apiKey: 'ward_abc123',
        status: 'unknown',
        createdAt: new Date('2024-01-02T00:00:00Z'),
      },
    ]),
    delete: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: { id: 'id', name: 'name', hostname: 'hostname', status: 'status', lastSeenAt: 'lastSeenAt', createdAt: 'createdAt', apiKey: 'apiKey' },
      metrics: { serverId: 'serverId', collectedAt: 'collectedAt' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
}));

const app = createApp();

describe('GET /api/servers', () => {
  it('서버 목록을 반환해야 한다', async () => {
    const res = await request(app).get('/api/servers');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('servers');
    expect(Array.isArray(res.body.servers)).toBe(true);
  });
});

describe('POST /api/servers', () => {
  it('name과 hostname으로 서버를 등록하고 apiKey를 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: '새 서버', hostname: 'new.example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('server');
    expect(res.body).toHaveProperty('apiKey');
    expect(res.body.server.name).toBe('새 서버');
  });

  it('name이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ hostname: 'new.example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('hostname이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: '새 서버' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('빈 name이면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: '  ', hostname: 'new.example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
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
