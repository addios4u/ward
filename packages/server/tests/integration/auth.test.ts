import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// vi.hoisted: vi.mock 팩토리보다 먼저 실행되어 모킹 객체를 공유할 수 있음
const mockRedisClient = vi.hoisted(() => ({
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  del: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-2),
  publish: vi.fn().mockResolvedValue(1),
}));

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
  getPubClient: vi.fn().mockReturnValue(mockRedisClient),
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
  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    // bcrypt hash of 'password123'
    passwordHash: '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    createdAt: new Date('2024-01-01'),
  };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockUser]),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      users: { id: 'id', email: 'email', passwordHash: 'password_hash' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

// bcrypt 모킹
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async (password: string) => password === 'password123'),
    hash: vi.fn(async () => 'hashed-password'),
  },
}));

// express-session 모킹 (세션 저장소 없이 테스트)
vi.mock('express-session', () => {
  const sessionData: Record<string, unknown> = {};
  const mockSession = vi.fn(() => (req: any, _res: any, next: any) => {
    req.session = {
      ...sessionData,
      userId: sessionData['userId'],
      save: vi.fn((cb: (err?: Error) => void) => cb()),
      destroy: vi.fn((cb: (err?: Error) => void) => {
        delete sessionData['userId'];
        cb();
      }),
      regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
    };
    next();
  });
  return { default: mockSession };
});

vi.mock('connect-redis', () => ({
  RedisStore: vi.fn().mockImplementation(() => ({})),
}));

const app = createApp();

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 차단 안 됨, 실패 횟수 0
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.expire.mockResolvedValue(1);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.ttl.mockResolvedValue(-2);
  });

  it('올바른 자격증명으로 로그인 시 세션 쿠키를 발급해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('admin@example.com');
  });

  it('잘못된 비밀번호로 로그인 시 401을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('email이 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('password가 없으면 400을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('존재하지 않는 이메일로 로그인 시 401을 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.limit).mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notfound@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('차단된 IP에서 로그인 시 429를 반환해야 한다', async () => {
    // ward:login:blocked:{ip} 키가 존재 → 차단 상태
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:blocked:')) return Promise.resolve('1');
      return Promise.resolve(null);
    });
    mockRedisClient.ttl.mockResolvedValue(3540);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('remainingSeconds');
  });

  it('5번 실패 후 차단 키를 설정해야 한다', async () => {
    // 5번째 incr → 5 반환 → 차단 키 설정
    mockRedisClient.incr.mockResolvedValue(5);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'wrongpassword' });

    // 5번째 실패 시 차단 키 설정 확인
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('ward:login:blocked:'),
      '1',
      'EX',
      3600,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('로그아웃 시 200을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});

describe('GET /api/auth/me', () => {
  it('인증 없이 요청 시 401을 반환해야 한다', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
