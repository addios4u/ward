import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });

  const mockDb = {
    delete: mockDelete,
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      metrics: { collectedAt: 'collected_at', id: 'id' },
      logs: { loggedAt: 'logged_at', id: 'id' },
      processes: { collectedAt: 'collected_at', id: 'id' },
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
    it('오래된 메트릭, 프로세스, 로그를 삭제해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const service = new CleanupService({ metricsDays: 30, logsDays: 7 });
      const result = await service.cleanup();

      // metrics + processes + logs = 3번 호출
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
      expect(result).toHaveProperty('deletedMetrics');
      expect(result).toHaveProperty('deletedLogs');
      expect(result).toHaveProperty('deletedProcesses');
    });

    it('삭제 결과가 0을 반환해야 한다 (.returning() 없음)', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const service = new CleanupService({ metricsDays: 30, logsDays: 7 });
      const result = await service.cleanup();

      expect(result.deletedMetrics).toBe(0);
      expect(result.deletedLogs).toBe(0);
      expect(result.deletedProcesses).toBe(0);
    });

    it('config 기본값으로 보존 기간이 설정되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      // 옵션 없이 생성하면 config 값(30일, 7일) 사용
      const service = new CleanupService();
      await service.cleanup();

      // metrics + processes + logs = 3번 호출
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('start() / stop()', () => {
    it('start() 호출 후 즉시 cleanup이 실행되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const service = new CleanupService({ intervalMs: 60 * 60 * 1000 });
      service.start();

      // 마이크로태스크(Promise) 처리 — 여러 번 await 필요 (async 체이닝)
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // 즉시 실행 1회: metrics + processes + logs = delete 3번 이상 호출
      expect(vi.mocked(mockDb.delete).mock.calls.length).toBeGreaterThanOrEqual(3);

      service.stop();
    });

    it('start() 후 intervalMs 경과 시 추가 cleanup이 실행되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const service = new CleanupService({ intervalMs: 1000 });
      service.start();

      // 즉시 실행 완료 대기
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const callsAfterStart = vi.mocked(mockDb.delete).mock.calls.length;

      // 1초 경과 후 추가 실행
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(vi.mocked(mockDb.delete).mock.calls.length).toBeGreaterThan(callsAfterStart);

      service.stop();
    });

    it('stop() 호출 후 더 이상 cleanup이 실행되지 않아야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockDb.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const service = new CleanupService({ intervalMs: 1000 });
      service.start();
      // 즉시 실행 완료 대기
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      service.stop();
      const callsAfterStop = vi.mocked(mockDb.delete).mock.calls.length;

      // stop 후 1초 경과해도 추가 실행 없음
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      expect(vi.mocked(mockDb.delete).mock.calls.length).toBe(callsAfterStop);
    });
  });
});
