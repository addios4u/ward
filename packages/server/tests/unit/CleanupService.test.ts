import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });

  const mockDb = {
    delete: mockDelete,
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      metrics: { collectedAt: 'collected_at', id: 'id' },
      logs: { loggedAt: 'logged_at', id: 'id' },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  lt: vi.fn((field, value) => ({ field, value, op: 'lt' })),
}));

// config 모킹
vi.mock('../../src/config/index.js', () => ({
  config: {
    retention: {
      metricsDays: 30,
      logsDays: 7,
    },
  },
}));

import { CleanupService } from '../../src/services/CleanupService.js';

describe('CleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cleanup()', () => {
    it('오래된 메트릭과 로그를 삭제하고 삭제 건수를 반환해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      // 메트릭 3건, 로그 5건 삭제된 것으로 모킹
      const mockReturning = vi.fn()
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])  // 메트릭 3건
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]); // 로그 5건

      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ metricsDays: 30, logsDays: 7 });
      const result = await service.cleanup();

      expect(result.deletedMetrics).toBe(3);
      expect(result.deletedLogs).toBe(5);
    });

    it('삭제된 항목이 없을 때 0을 반환해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ metricsDays: 30, logsDays: 7 });
      const result = await service.cleanup();

      expect(result.deletedMetrics).toBe(0);
      expect(result.deletedLogs).toBe(0);
    });

    it('메트릭과 로그 각각 delete를 호출해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ metricsDays: 30, logsDays: 7 });
      await service.cleanup();

      // 메트릭 삭제 + 로그 삭제 = 2번 호출
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('config 기본값으로 보존 기간이 설정되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      // 옵션 없이 생성하면 config 값(30일, 7일) 사용
      const service = new CleanupService();
      await service.cleanup();

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('start() / stop()', () => {
    it('start() 호출 후 즉시 cleanup이 실행되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ intervalMs: 60 * 60 * 1000 });
      service.start();

      // 마이크로태스크(Promise) 처리
      await Promise.resolve();

      // 즉시 실행 1회: 메트릭 + 로그 = delete 2번 호출
      expect(vi.mocked(mockDb.delete).mock.calls.length).toBeGreaterThanOrEqual(2);

      service.stop();
    });

    it('start() 후 intervalMs 경과 시 추가 cleanup이 실행되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ intervalMs: 1000 });
      service.start();

      // 즉시 실행 대기
      await Promise.resolve();
      const callsAfterStart = vi.mocked(mockDb.delete).mock.calls.length;

      // 1초 경과 후 추가 실행
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(vi.mocked(mockDb.delete).mock.calls.length).toBeGreaterThan(callsAfterStart);

      service.stop();
    });

    it('stop() 호출 후 더 이상 cleanup이 실행되지 않아야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: mockReturning }),
      } as any);

      const service = new CleanupService({ intervalMs: 1000 });
      service.start();
      await Promise.resolve();

      service.stop();
      const callsAfterStop = vi.mocked(mockDb.delete).mock.calls.length;

      // stop 후 1초 경과해도 추가 실행 없음
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(vi.mocked(mockDb.delete).mock.calls.length).toBe(callsAfterStop);
    });
  });
});
