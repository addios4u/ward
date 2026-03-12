import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockLogs = [
    {
      id: 1,
      serverId: 'server-uuid-1',
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

// jwt 모킹 — 인증 통과
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(() => ({ userId: 'user-uuid-1', email: 'admin@example.com' })),
    sign: vi.fn(() => 'mocked-token'),
  },
}));

const app = createApp();
const authHeader = 'Bearer valid-token';

describe('GET /api/servers/:id/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('JWT 인증 없이 접근 시 401을 반환해야 한다', async () => {
    const res = await request(app).get('/api/servers/server-uuid-1/logs');
    expect(res.status).toBe(401);
  });

  it('유효한 토큰으로 로그 목록을 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 서버 존재 확인용 limit (별도로 재정의)
    vi.mocked(mockDb.limit).mockReturnThis();
    vi.mocked(mockDb.offset).mockResolvedValueOnce([
      {
        id: 1,
        serverId: 'server-uuid-1',
        source: 'nginx',
        level: 'error',
        message: '500 Internal Server Error',
        loggedAt: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    // 서버 exists 체크를 위해 limit이 서버를 반환하도록
    vi.mocked(mockDb.limit).mockImplementationOnce(() => ({
      ...mockDb,
      then: (resolve: (value: unknown[]) => void) => resolve([{ id: 'server-uuid-1' }]),
    } as unknown as typeof mockDb));

    const res = await request(app)
      .get('/api/servers/server-uuid-1/logs')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it('level 쿼리 파라미터로 필터링할 수 있어야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit).mockImplementationOnce(() => ({
      ...mockDb,
      then: (resolve: (value: unknown[]) => void) => resolve([{ id: 'server-uuid-1' }]),
    } as unknown as typeof mockDb));

    vi.mocked(mockDb.offset).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/servers/server-uuid-1/logs?level=error')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
  });
});
