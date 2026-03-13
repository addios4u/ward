import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// DB 모킹
vi.mock('../../src/db/index.js', () => {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockDb = {
    update: mockUpdate,
  };

  return {
    getDb: vi.fn().mockReturnValue(mockDb),
    schema: {
      servers: {
        id: 'id',
        status: 'status',
        lastSeenAt: 'last_seen_at',
      },
    },
    closePool: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  lt: vi.fn((field, value) => ({ field, value, op: 'lt' })),
  eq: vi.fn((field, value) => ({ field, value })),
}));

vi.mock('../../src/lib/redis.js', () => ({
  safePublish: vi.fn().mockResolvedValue(undefined),
  REDIS_CHANNELS: {
    serverStatus: 'ward:server:status',
    metrics: (id: string) => `ward:metrics:${id}`,
    logs: (id: string) => `ward:logs:${id}`,
  },
}));

import { HeartbeatMonitor } from '../../src/services/HeartbeatMonitor.js';

describe('HeartbeatMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('check()', () => {
    it('lastSeenAt이 오래된 서버를 offline으로 업데이트해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([
        { id: 'server-1' },
        { id: 'server-2' },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as any);

      const monitor = new HeartbeatMonitor();
      const result = await monitor.check();

      expect(result.markedOffline).toBe(2);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('offline으로 표시된 서버가 없으면 0을 반환해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as any);

      const monitor = new HeartbeatMonitor();
      const result = await monitor.check();

      expect(result.markedOffline).toBe(0);
    });

    it('offline 서버에 대해 Redis Pub/Sub를 발행해야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const { safePublish } = await import('../../src/lib/redis.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([{ id: 'server-offline-1' }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as any);

      const monitor = new HeartbeatMonitor();
      await monitor.check();

      expect(safePublish).toHaveBeenCalledWith(
        'ward:server:status',
        JSON.stringify({ serverId: 'server-offline-1', status: 'offline' })
      );
    });
  });

  describe('start() / stop()', () => {
    it('start() 후 intervalMs 경과 시 check가 실행되어야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as any);

      const monitor = new HeartbeatMonitor({ intervalMs: 1000 });
      monitor.start();

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockDb.update).toHaveBeenCalled();

      monitor.stop();
    });

    it('stop() 호출 후 더 이상 check가 실행되지 않아야 한다', async () => {
      const { getDb } = await import('../../src/db/index.js');
      const mockDb = getDb();

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(mockDb.update).mockReturnValue({ set: mockSet } as any);

      const monitor = new HeartbeatMonitor({ intervalMs: 1000 });
      monitor.start();

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      monitor.stop();
      const callsAfterStop = vi.mocked(mockDb.update).mock.calls.length;

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(vi.mocked(mockDb.update).mock.calls.length).toBe(callsAfterStop);
    });
  });
});
