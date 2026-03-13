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

// bcrypt 모킹
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('hashed-password'),
  compare: vi.fn().mockResolvedValue(true),
}));

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
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
        lastSeenAt: 'lastSeenAt',
        createdAt: 'createdAt',
        apiKey: 'apiKey',
      },
      metrics: { serverId: 'serverId', collectedAt: 'collectedAt' },
      processes: { serverId: 'serverId', collectedAt: 'collectedAt' },
      users: { id: 'id', email: 'email', passwordHash: 'passwordHash', createdAt: 'createdAt' },
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

describe('GET /api/users', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks 후 체인 메서드 복구
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.select).mockReturnThis();
    vi.mocked(mockDb.from).mockReturnThis();
    vi.mocked(mockDb.where).mockReturnThis();
    vi.mocked(mockDb.orderBy).mockReturnThis();
    vi.mocked(mockDb.limit).mockResolvedValue([]);
    vi.mocked(mockDb.insert).mockReturnThis();
    vi.mocked(mockDb.values).mockReturnThis();
    vi.mocked(mockDb.returning).mockResolvedValue([]);
    vi.mocked(mockDb.delete).mockReturnThis();
    vi.mocked(mockDb.update).mockReturnThis();
    vi.mocked(mockDb.set).mockReturnThis();
  });

  it('사용자 목록을 반환해야 한다 (passwordHash 제외)', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.orderBy).mockResolvedValueOnce([
      { id: 'user-uuid-1', email: 'admin@example.com', createdAt: new Date('2024-01-01T00:00:00Z') },
    ] as any);

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
    expect(res.body.users[0]).toHaveProperty('email');
  });
});

describe('POST /api/users', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks 후 체인 메서드 복구
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.select).mockReturnThis();
    vi.mocked(mockDb.from).mockReturnThis();
    vi.mocked(mockDb.where).mockReturnThis();
    vi.mocked(mockDb.orderBy).mockReturnThis();
    vi.mocked(mockDb.limit).mockResolvedValue([]);
    vi.mocked(mockDb.insert).mockReturnThis();
    vi.mocked(mockDb.values).mockReturnThis();
    vi.mocked(mockDb.returning).mockResolvedValue([]);
    vi.mocked(mockDb.delete).mockReturnThis();
    vi.mocked(mockDb.update).mockReturnThis();
    vi.mocked(mockDb.set).mockReturnThis();
  });

  it('새 사용자를 생성해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 중복 이메일 확인: 없음
    vi.mocked(mockDb.limit).mockResolvedValueOnce([] as any);

    // 사용자 생성 반환
    vi.mocked(mockDb.returning).mockResolvedValueOnce([
      { id: 'user-uuid-new', email: 'new@example.com', createdAt: new Date('2024-01-02T00:00:00Z') },
    ] as any);

    const res = await request(app)
      .post('/api/users')
      .send({ email: 'new@example.com', password: 'securepassword' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('email이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ password: 'securepassword' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('password가 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('이메일 중복 시 409를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 이미 존재하는 사용자
    vi.mocked(mockDb.limit).mockResolvedValueOnce([
      { id: 'user-uuid-1', email: 'existing@example.com', createdAt: new Date() },
    ] as any);

    const res = await request(app)
      .post('/api/users')
      .send({ email: 'existing@example.com', password: 'securepassword' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
});

describe('DELETE /api/users/:id', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks 후 체인 메서드 복구
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.select).mockReturnThis();
    vi.mocked(mockDb.from).mockReturnThis();
    vi.mocked(mockDb.where).mockReturnThis();
    vi.mocked(mockDb.orderBy).mockReturnThis();
    vi.mocked(mockDb.limit).mockResolvedValue([]);
    vi.mocked(mockDb.insert).mockReturnThis();
    vi.mocked(mockDb.values).mockReturnThis();
    vi.mocked(mockDb.returning).mockResolvedValue([]);
    vi.mocked(mockDb.delete).mockReturnThis();
    vi.mocked(mockDb.update).mockReturnThis();
    vi.mocked(mockDb.set).mockReturnThis();
  });

  it('사용자 삭제 성공 시 204를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 전체 사용자 수: 2명 (limit으로 체인 종료)
    vi.mocked(mockDb.limit).mockResolvedValueOnce([
      { id: 'user-uuid-1' },
      { id: 'user-uuid-2' },
    ] as any);

    // 삭제 성공
    vi.mocked(mockDb.returning).mockResolvedValueOnce([
      { id: 'user-uuid-2' },
    ] as any);

    const res = await request(app).delete('/api/users/user-uuid-2');

    expect(res.status).toBe(204);
  });

  it('마지막 사용자는 삭제할 수 없다 (400)', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 전체 사용자 수: 1명 (limit으로 체인 종료)
    vi.mocked(mockDb.limit).mockResolvedValueOnce([
      { id: 'user-uuid-1' },
    ] as any);

    const res = await request(app).delete('/api/users/user-uuid-1');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('존재하지 않는 사용자 삭제 시 404를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 전체 사용자 수: 2명 (limit으로 체인 종료)
    vi.mocked(mockDb.limit).mockResolvedValueOnce([
      { id: 'user-uuid-1' },
      { id: 'user-uuid-2' },
    ] as any);

    // 삭제 결과 없음
    vi.mocked(mockDb.returning).mockResolvedValueOnce([] as any);

    const res = await request(app).delete('/api/users/nonexistent-uuid');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PATCH /api/users/:id/password', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks 후 체인 메서드 복구
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.select).mockReturnThis();
    vi.mocked(mockDb.from).mockReturnThis();
    vi.mocked(mockDb.where).mockReturnThis();
    vi.mocked(mockDb.orderBy).mockReturnThis();
    vi.mocked(mockDb.limit).mockResolvedValue([]);
    vi.mocked(mockDb.insert).mockReturnThis();
    vi.mocked(mockDb.values).mockReturnThis();
    vi.mocked(mockDb.returning).mockResolvedValue([]);
    vi.mocked(mockDb.delete).mockReturnThis();
    vi.mocked(mockDb.update).mockReturnThis();
    vi.mocked(mockDb.set).mockReturnThis();
  });

  it('비밀번호 변경에 성공해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 사용자 존재 확인
    vi.mocked(mockDb.limit).mockResolvedValueOnce([
      { id: 'user-uuid-1' },
    ] as any);

    // 업데이트 반환
    vi.mocked(mockDb.returning).mockResolvedValueOnce([
      { id: 'user-uuid-1' },
    ] as any);

    const res = await request(app)
      .patch('/api/users/user-uuid-1/password')
      .send({ password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('존재하지 않는 사용자 비밀번호 변경 시 404를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 사용자 없음
    vi.mocked(mockDb.limit).mockResolvedValueOnce([] as any);

    const res = await request(app)
      .patch('/api/users/nonexistent-uuid/password')
      .send({ password: 'newpassword123' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
