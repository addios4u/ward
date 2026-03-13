import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// 모든 테스트 전에 mockRedisClient 상태를 초기화 (describe 간 상태 누수 방지)
beforeEach(() => {
  mockRedisClient.get.mockReset().mockResolvedValue(null);
  mockRedisClient.set.mockReset().mockResolvedValue('OK');
  mockRedisClient.incr.mockReset().mockResolvedValue(1);
  mockRedisClient.expire.mockReset().mockResolvedValue(1);
  mockRedisClient.del.mockReset().mockResolvedValue(1);
  mockRedisClient.ttl.mockReset().mockResolvedValue(-2);
});

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

// Rate limiter 모킹: 테스트에서 요청 횟수 제한 우회
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  rateLimit: vi.fn(() => (_req: any, _res: any, next: any) => next()),
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

describe('GET /api/auth/captcha', () => {
  it('수학 문제와 서명된 토큰을 반환해야 한다', async () => {
    const res = await request(app).get('/api/auth/captcha');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('question');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.question).toMatch(/\d+ \+ \d+ = \?/);
  });
});

describe('POST /api/auth/login (CAPTCHA 검증)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockImplementation이 이전 테스트에서 남지 않도록 명시적으로 기본값 복원
    mockRedisClient.get.mockReset().mockResolvedValue(null);
    mockRedisClient.incr.mockReset().mockResolvedValue(1);
    mockRedisClient.expire.mockReset().mockResolvedValue(1);
    mockRedisClient.del.mockReset().mockResolvedValue(1);
    mockRedisClient.ttl.mockReset().mockResolvedValue(-2);
    mockRedisClient.set.mockReset().mockResolvedValue('OK');
  });

  it('실패 횟수 3회 미만이면 captchaToken 없이도 로그인할 수 있어야 한다', async () => {
    // 실패 횟수 2회 (3회 미만)
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:attempts:')) return Promise.resolve('2');
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(res.status).toBe(200);
  });

  it('실패 횟수 3회 이상이면 captchaToken이 없을 때 400을 반환해야 한다', async () => {
    // 실패 횟수 3회 이상
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:attempts:')) return Promise.resolve('3');
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('captcha');
  });

  it('올바른 CAPTCHA 토큰으로 로그인 시 성공해야 한다', async () => {
    // 실패 횟수 3회
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:attempts:')) return Promise.resolve('3');
      return Promise.resolve(null);
    });

    // CAPTCHA 토큰 발급
    const captchaRes = await request(app).get('/api/auth/captcha');
    const { token, question } = captchaRes.body;

    // 문제에서 정답 추출 (예: "3 + 7 = ?")
    const match = question.match(/(\d+) \+ (\d+) = \?/);
    const answer = String(parseInt(match[1]) + parseInt(match[2]));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123', captchaToken: token, captchaAnswer: answer });

    expect(res.status).toBe(200);
  });

  it('틀린 CAPTCHA 답변으로 로그인 시 400을 반환해야 한다', async () => {
    // 실패 횟수 3회
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:attempts:')) return Promise.resolve('3');
      return Promise.resolve(null);
    });

    // CAPTCHA 토큰 발급
    const captchaRes = await request(app).get('/api/auth/captcha');
    const { token } = captchaRes.body;

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123', captchaToken: token, captchaAnswer: '9999' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('만료된 CAPTCHA 토큰으로 로그인 시 400을 반환해야 한다', async () => {
    // 실패 횟수 3회
    mockRedisClient.get.mockImplementation((key: string) => {
      if (key.startsWith('ward:login:attempts:')) return Promise.resolve('3');
      return Promise.resolve(null);
    });

    // 만료된 토큰 (6분 전 타임스탬프)
    const expiredToken = Buffer.from('expired:token:data').toString('base64');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123', captchaToken: expiredToken, captchaAnswer: '5' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
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
