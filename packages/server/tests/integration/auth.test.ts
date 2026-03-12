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

// bcrypt 모킹 — 실제 해싱 대신 간단히 처리
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async (password: string) => password === 'password123'),
  },
}));

// jwt 모킹
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mocked-jwt-token'),
    verify: vi.fn(),
  },
}));

const app = createApp();

describe('POST /api/auth/login', () => {
  it('올바른 자격증명으로 로그인 시 JWT 토큰을 반환해야 한다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
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
});
