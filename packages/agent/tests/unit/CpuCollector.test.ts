import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpuCollector } from '../../src/metrics/CpuCollector.js';

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    currentLoad: vi.fn(),
  },
}));

// os 모킹 - default import용 mock (vi.hoisted로 호이스팅 문제 해결)
const { mockLoadavg } = vi.hoisted(() => ({
  mockLoadavg: vi.fn().mockReturnValue([0, 0, 0]),
}));
vi.mock('os', () => ({
  default: {
    loadavg: mockLoadavg,
  },
  loadavg: mockLoadavg,
}));

describe('CpuCollector', () => {
  let collector: CpuCollector;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadavg.mockReturnValue([0, 0, 0]);
    collector = new CpuCollector();
  });

  it('CPU 사용률을 수집해야 한다', async () => {
    const si = await import('systeminformation');
    mockLoadavg.mockReturnValue([1.2, 0.8, 0.5]);
    vi.mocked(si.default.currentLoad).mockResolvedValue({
      avgLoad: 1.5,
      currentLoad: 45.678,
      currentLoadUser: 30,
      currentLoadSystem: 15,
      currentLoadNice: 0,
      currentLoadIdle: 54.322,
      currentLoadIrq: 0,
      currentLoadSteal: 0,
      currentLoadGuest: 0,
      rawCurrentLoad: 0,
      rawCurrentLoadUser: 0,
      rawCurrentLoadSystem: 0,
      rawCurrentLoadNice: 0,
      rawCurrentLoadIdle: 0,
      rawCurrentLoadIrq: 0,
      rawCurrentLoadSteal: 0,
      rawCurrentLoadGuest: 0,
      cpus: [
        {
          load: 45,
          loadUser: 30,
          loadSystem: 15,
          loadNice: 0,
          loadIdle: 55,
          loadIrq: 0,
          loadSteal: 0,
          loadGuest: 0,
          rawLoad: 0,
          rawLoadUser: 0,
          rawLoadSystem: 0,
          rawLoadNice: 0,
          rawLoadIdle: 0,
          rawLoadIrq: 0,
          rawLoadSteal: 0,
          rawLoadGuest: 0,
        },
      ],
    } as any);

    const metrics = await collector.collect();

    expect(metrics.usage).toBe(45.68);
    expect(metrics.cores).toBe(1);
    expect(Array.isArray(metrics.loadAvg)).toBe(true);
    expect(metrics.loadAvg).toHaveLength(3);
  });

  it('loadAvg가 1분/5분/15분 각각 다른 값으로 채워져야 한다', async () => {
    const si = await import('systeminformation');
    mockLoadavg.mockReturnValue([1.2, 0.8, 0.5]);
    vi.mocked(si.default.currentLoad).mockResolvedValue({
      avgLoad: 1.5,
      currentLoad: 20,
      currentLoadUser: 10,
      currentLoadSystem: 10,
      currentLoadNice: 0,
      currentLoadIdle: 80,
      currentLoadIrq: 0,
      currentLoadSteal: 0,
      currentLoadGuest: 0,
      rawCurrentLoad: 0,
      rawCurrentLoadUser: 0,
      rawCurrentLoadSystem: 0,
      rawCurrentLoadNice: 0,
      rawCurrentLoadIdle: 0,
      rawCurrentLoadIrq: 0,
      rawCurrentLoadSteal: 0,
      rawCurrentLoadGuest: 0,
      cpus: [],
    } as any);

    const metrics = await collector.collect();

    // 1분/5분/15분 load average가 각각 다른 값이어야 함
    expect(metrics.loadAvg[0]).toBe(1.2);
    expect(metrics.loadAvg[1]).toBe(0.8);
    expect(metrics.loadAvg[2]).toBe(0.5);
  });

  it('si.currentLoad()를 정확히 1번만 호출해야 한다', async () => {
    const si = await import('systeminformation');
    mockLoadavg.mockReturnValue([0.5, 0.3, 0.2]);
    vi.mocked(si.default.currentLoad).mockResolvedValue({
      avgLoad: 0.5,
      currentLoad: 20,
      currentLoadUser: 10,
      currentLoadSystem: 10,
      currentLoadNice: 0,
      currentLoadIdle: 80,
      currentLoadIrq: 0,
      currentLoadSteal: 0,
      currentLoadGuest: 0,
      rawCurrentLoad: 0,
      rawCurrentLoadUser: 0,
      rawCurrentLoadSystem: 0,
      rawCurrentLoadNice: 0,
      rawCurrentLoadIdle: 0,
      rawCurrentLoadIrq: 0,
      rawCurrentLoadSteal: 0,
      rawCurrentLoadGuest: 0,
      cpus: new Array(4).fill({
        load: 20,
        loadUser: 10,
        loadSystem: 10,
        loadNice: 0,
        loadIdle: 80,
        loadIrq: 0,
        loadSteal: 0,
        loadGuest: 0,
        rawLoad: 0,
        rawLoadUser: 0,
        rawLoadSystem: 0,
        rawLoadNice: 0,
        rawLoadIdle: 0,
        rawLoadIrq: 0,
        rawLoadSteal: 0,
        rawLoadGuest: 0,
      }),
    } as any);

    await collector.collect();

    // si.currentLoad()는 정확히 1번만 호출되어야 함
    expect(vi.mocked(si.default.currentLoad)).toHaveBeenCalledTimes(1);
  });

  it('CPU 코어 수를 올바르게 수집해야 한다', async () => {
    const si = await import('systeminformation');
    mockLoadavg.mockReturnValue([0.5, 0.3, 0.2]);
    vi.mocked(si.default.currentLoad).mockResolvedValue({
      avgLoad: 0.5,
      currentLoad: 20,
      currentLoadUser: 10,
      currentLoadSystem: 10,
      currentLoadNice: 0,
      currentLoadIdle: 80,
      currentLoadIrq: 0,
      currentLoadSteal: 0,
      currentLoadGuest: 0,
      rawCurrentLoad: 0,
      rawCurrentLoadUser: 0,
      rawCurrentLoadSystem: 0,
      rawCurrentLoadNice: 0,
      rawCurrentLoadIdle: 0,
      rawCurrentLoadIrq: 0,
      rawCurrentLoadSteal: 0,
      rawCurrentLoadGuest: 0,
      cpus: new Array(8).fill({
        load: 20,
        loadUser: 10,
        loadSystem: 10,
        loadNice: 0,
        loadIdle: 80,
        loadIrq: 0,
        loadSteal: 0,
        loadGuest: 0,
        rawLoad: 0,
        rawLoadUser: 0,
        rawLoadSystem: 0,
        rawLoadNice: 0,
        rawLoadIdle: 0,
        rawLoadIrq: 0,
        rawLoadSteal: 0,
        rawLoadGuest: 0,
      }),
    } as any);

    const metrics = await collector.collect();

    expect(metrics.cores).toBe(8);
  });
});
