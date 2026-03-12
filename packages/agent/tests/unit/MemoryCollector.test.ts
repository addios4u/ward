import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCollector } from '../../src/metrics/MemoryCollector.js';

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    mem: vi.fn(),
  },
}));

describe('MemoryCollector', () => {
  let collector: MemoryCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new MemoryCollector();
  });

  it('메모리 정보를 올바르게 수집해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.mem).mockResolvedValue({
      total: 8 * 1024 * 1024 * 1024,    // 8GB
      free: 2 * 1024 * 1024 * 1024,     // 2GB
      used: 6 * 1024 * 1024 * 1024,     // 6GB
      active: 5 * 1024 * 1024 * 1024,
      available: 2 * 1024 * 1024 * 1024,
      buffers: 0,
      cached: 0,
      slab: 0,
      buffcache: 0,
      swaptotal: 2 * 1024 * 1024 * 1024,  // 2GB 스왑
      swapused: 512 * 1024 * 1024,        // 512MB 스왑 사용
      swapfree: 1.5 * 1024 * 1024 * 1024,
      writeback: null,
      dirty: null,
    } as any);

    const metrics = await collector.collect();

    expect(metrics.total).toBe(8 * 1024 * 1024 * 1024);
    expect(metrics.used).toBe(6 * 1024 * 1024 * 1024);
    expect(metrics.free).toBe(2 * 1024 * 1024 * 1024);
    expect(metrics.usagePercent).toBe(75); // 6/8 * 100
    expect(metrics.swapTotal).toBe(2 * 1024 * 1024 * 1024);
    expect(metrics.swapUsed).toBe(512 * 1024 * 1024);
  });

  it('메모리 사용률을 올바르게 계산해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.mem).mockResolvedValue({
      total: 1000,
      free: 300,
      used: 700,
      active: 700,
      available: 300,
      buffers: 0,
      cached: 0,
      slab: 0,
      buffcache: 0,
      swaptotal: 0,
      swapused: 0,
      swapfree: 0,
      writeback: null,
      dirty: null,
    } as any);

    const metrics = await collector.collect();

    expect(metrics.usagePercent).toBe(70); // 700/1000 * 100
  });

  it('전체 메모리가 0이면 사용률을 0으로 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.mem).mockResolvedValue({
      total: 0,
      free: 0,
      used: 0,
      active: 0,
      available: 0,
      buffers: 0,
      cached: 0,
      slab: 0,
      buffcache: 0,
      swaptotal: 0,
      swapused: 0,
      swapfree: 0,
      writeback: null,
      dirty: null,
    } as any);

    const metrics = await collector.collect();

    expect(metrics.usagePercent).toBe(0);
  });
});
