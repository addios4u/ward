import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
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

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(mockServers),
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
    limit: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: { id: 'id', name: 'name', hostname: 'hostname', status: 'status', lastSeenAt: 'lastSeenAt', createdAt: 'createdAt', apiKey: 'apiKey' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
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
    // returning이 빈 배열을 반환하도록 재정의
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
