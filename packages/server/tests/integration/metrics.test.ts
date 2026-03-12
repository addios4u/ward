import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockMetrics = [
    {
      id: 1,
      serverId: 'server-uuid-1',
      collectedAt: new Date('2024-01-01T00:00:00Z'),
      cpuUsage: 45.5,
      memTotal: 8589934592,
      memUsed: 4294967296,
      diskUsage: null,
      networkIo: null,
      loadAvg: [1.0, 0.8, 0.6],
    },
  ];

  const mockServer = { id: 'server-uuid-1' };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockServer]),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: { id: 'id', name: 'name', hostname: 'hostname', status: 'status', lastSeenAt: 'lastSeenAt' },
      metrics: { serverId: 'server_id', collectedAt: 'collected_at' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
  desc: vi.fn((field) => ({ field, direction: 'desc' })),
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

describe('GET /api/servers/:id/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('JWT 인증 없이 접근 시 401을 반환해야 한다', async () => {
    const res = await request(app).get('/api/servers/server-uuid-1/metrics');
    expect(res.status).toBe(401);
  });

  it('유효한 토큰으로 메트릭 히스토리를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 서버 조회 → 메트릭 조회
    vi.mocked(mockDb.limit)
      .mockResolvedValueOnce([{ id: 'server-uuid-1' }])
      .mockResolvedValueOnce([
        {
          id: 1,
          serverId: 'server-uuid-1',
          collectedAt: new Date('2024-01-01T00:00:00Z'),
          cpuUsage: 45.5,
          memTotal: 8589934592,
          memUsed: 4294967296,
          diskUsage: null,
          networkIo: null,
          loadAvg: [1.0, 0.8, 0.6],
        },
      ]);

    const res = await request(app)
      .get('/api/servers/server-uuid-1/metrics')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('metrics');
    expect(Array.isArray(res.body.metrics)).toBe(true);
  });

  it('존재하지 않는 서버 조회 시 404를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();
    vi.mocked(mockDb.limit).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/servers/nonexistent/metrics')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/servers/:id/status', () => {
  it('최신 서버 상태를 반환해야 한다', async () => {
    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    vi.mocked(mockDb.limit)
      .mockResolvedValueOnce([
        {
          id: 'server-uuid-1',
          name: '웹 서버',
          hostname: 'web-01',
          status: 'online',
          lastSeenAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/servers/server-uuid-1/status')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('server');
    expect(res.body).toHaveProperty('latestMetric');
  });
});
