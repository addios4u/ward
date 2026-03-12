import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiskCollector } from '../../src/metrics/DiskCollector.js';

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    fsSize: vi.fn(),
  },
}));

describe('DiskCollector', () => {
  let collector: DiskCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new DiskCollector();
  });

  it('디스크 마운트 정보를 올바르게 수집해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.fsSize).mockResolvedValue([
      {
        fs: '/dev/sda1',
        type: 'ext4',
        size: 100 * 1024 * 1024 * 1024,  // 100GB
        used: 40 * 1024 * 1024 * 1024,   // 40GB
        available: 60 * 1024 * 1024 * 1024,
        use: 40,  // 40%
        mount: '/',
      },
      {
        fs: '/dev/sdb1',
        type: 'ext4',
        size: 500 * 1024 * 1024 * 1024,  // 500GB
        used: 200 * 1024 * 1024 * 1024,  // 200GB
        available: 300 * 1024 * 1024 * 1024,
        use: 40,  // 40%
        mount: '/data',
      },
    ] as any);

    const metrics = await collector.collect();

    expect(metrics.mounts).toHaveLength(2);
    expect(metrics.mounts[0]?.mount).toBe('/');
    expect(metrics.mounts[0]?.device).toBe('/dev/sda1');
    expect(metrics.mounts[0]?.total).toBe(100 * 1024 * 1024 * 1024);
    expect(metrics.mounts[0]?.used).toBe(40 * 1024 * 1024 * 1024);
    expect(metrics.mounts[0]?.usagePercent).toBe(40);
  });

  it('여유 공간을 올바르게 계산해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.fsSize).mockResolvedValue([
      {
        fs: '/dev/sda1',
        type: 'ext4',
        size: 1000,
        used: 600,
        available: 400,
        use: 60,
        mount: '/',
      },
    ] as any);

    const metrics = await collector.collect();

    expect(metrics.mounts[0]?.free).toBe(400); // size - used
  });

  it('마운트가 없으면 빈 배열을 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.fsSize).mockResolvedValue([]);

    const metrics = await collector.collect();

    expect(metrics.mounts).toHaveLength(0);
  });
});
