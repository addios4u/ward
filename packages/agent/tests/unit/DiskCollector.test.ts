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

  it('디스크 마운트 정보를 Record 형태로 반환해야 한다', async () => {
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

    // Record<mountPoint, {...}> 구조 검증
    expect(metrics['/']).toBeDefined();
    expect(metrics['/data']).toBeDefined();
    expect(metrics['/']?.total).toBe(100 * 1024 * 1024 * 1024);
    expect(metrics['/']?.used).toBe(40 * 1024 * 1024 * 1024);
    expect(metrics['/']?.usagePercent).toBe(40);
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

    expect(metrics['/']?.free).toBe(400); // size - used
  });

  it('마운트가 없으면 빈 객체를 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.fsSize).mockResolvedValue([]);

    const metrics = await collector.collect();

    expect(Object.keys(metrics)).toHaveLength(0);
  });

  it('각 마운트 포인트가 키로 사용되어야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.fsSize).mockResolvedValue([
      {
        fs: '/dev/sda1',
        type: 'ext4',
        size: 1000,
        used: 500,
        available: 500,
        use: 50,
        mount: '/home',
      },
    ] as any);

    const metrics = await collector.collect();

    expect(Object.keys(metrics)).toContain('/home');
    expect(metrics['/home']?.total).toBe(1000);
    expect(metrics['/home']?.used).toBe(500);
    expect(metrics['/home']?.free).toBe(500);
    expect(metrics['/home']?.usagePercent).toBe(50);
  });
});
