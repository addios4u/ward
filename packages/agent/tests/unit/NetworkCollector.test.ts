import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkCollector } from '../../src/metrics/NetworkCollector.js';

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    networkStats: vi.fn(),
  },
}));

describe('NetworkCollector', () => {
  let collector: NetworkCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new NetworkCollector();
  });

  it('네트워크 인터페이스 정보를 Record 형태로 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.networkStats).mockResolvedValue([
      {
        iface: 'eth0',
        operstate: 'up',
        rx_bytes: 1024 * 1024 * 100,  // 100MB 수신
        rx_dropped: 0,
        rx_errors: 0,
        tx_bytes: 1024 * 1024 * 50,   // 50MB 송신
        tx_dropped: 0,
        tx_errors: 0,
        rx_sec: 1024 * 10,
        tx_sec: 1024 * 5,
        ms: 100,
      },
      {
        iface: 'lo',
        operstate: 'up',
        rx_bytes: 1000,
        rx_dropped: 0,
        rx_errors: 0,
        tx_bytes: 1000,
        tx_dropped: 0,
        tx_errors: 0,
        rx_sec: 0,
        tx_sec: 0,
        ms: 0,
      },
    ] as any);

    const metrics = await collector.collect();

    // Record<ifaceName, {rx, tx}> 구조 검증
    expect(metrics['eth0']).toBeDefined();
    expect(metrics['lo']).toBeDefined();
    expect(metrics['eth0']?.rx).toBe(1024 * 1024 * 100);
    expect(metrics['eth0']?.tx).toBe(1024 * 1024 * 50);
  });

  it('인터페이스가 없으면 빈 객체를 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.networkStats).mockResolvedValue([]);

    const metrics = await collector.collect();

    expect(Object.keys(metrics)).toHaveLength(0);
  });

  it('각 인터페이스명이 키로 사용되어야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.networkStats).mockResolvedValue([
      {
        iface: 'ens3',
        operstate: 'up',
        rx_bytes: 5000,
        rx_dropped: 0,
        rx_errors: 0,
        tx_bytes: 3000,
        tx_dropped: 0,
        tx_errors: 0,
        rx_sec: null,
        tx_sec: null,
        ms: 0,
      },
    ] as any);

    const metrics = await collector.collect();

    expect(Object.keys(metrics)).toContain('ens3');
    expect(metrics['ens3']?.rx).toBe(5000);
    expect(metrics['ens3']?.tx).toBe(3000);
  });
});
