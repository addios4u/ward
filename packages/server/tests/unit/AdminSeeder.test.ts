import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockInsert = vi.fn().mockReturnThis();
  const mockValues = vi.fn().mockResolvedValue([]);
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockDb = {
    select: mockSelect,
    insert: mockInsert,
    values: mockValues,
  };

  // insert().values() 체이닝 지원
  mockInsert.mockReturnValue({ values: mockValues });

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      users: {
        id: 'id',
        email: 'email',
        passwordHash: 'password_hash',
      },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(async () => 'hashed-password'),
    compare: vi.fn(async () => true),
  },
}));

import { AdminSeeder } from '../../src/services/AdminSeeder.js';

describe('AdminSeeder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it('ADMIN_EMAIL, ADMIN_PASSWORD 환경변수가 없으면 경고 로그만 출력해야 한다', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const seeder = new AdminSeeder();
    await seeder.seed();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ADMIN_EMAIL 또는 ADMIN_PASSWORD')
    );

    consoleSpy.mockRestore();
  });

  it('이미 존재하는 사용자가 있으면 삽입하지 않아야 한다', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 기존 유저 존재하도록 모킹
    const mockLimit = vi.fn().mockResolvedValue([{ id: 'existing-user-id' }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(mockDb.select).mockReturnValue({ from: mockFrom } as any);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const seeder = new AdminSeeder();
    await seeder.seed();

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('이미 존재합니다')
    );

    consoleSpy.mockRestore();
  });

  it('사용자가 없으면 새 관리자 계정을 생성해야 한다', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'password123';

    const { getDb } = await import('../../src/db/index.js');
    const mockDb = getDb();

    // 기존 유저 없음
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(mockDb.select).mockReturnValue({ from: mockFrom } as any);

    const mockValues = vi.fn().mockResolvedValue([]);
    vi.mocked(mockDb.insert).mockReturnValue({ values: mockValues } as any);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const seeder = new AdminSeeder();
    await seeder.seed();

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com' })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('생성 완료')
    );

    consoleSpy.mockRestore();
  });
});
