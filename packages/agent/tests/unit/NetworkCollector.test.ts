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

  it('네트워크 인터페이스 정보를 올바르게 수집해야 한다', async () => {
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
        rx_sec: 1024 * 10,  // 10KB/s 수신 속도
        tx_sec: 1024 * 5,   // 5KB/s 송신 속도
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

    expect(metrics.interfaces).toHaveLength(2);
    expect(metrics.interfaces[0]?.interface).toBe('eth0');
    expect(metrics.interfaces[0]?.rxBytes).toBe(1024 * 1024 * 100);
    expect(metrics.interfaces[0]?.txBytes).toBe(1024 * 1024 * 50);
    expect(metrics.interfaces[0]?.rxSec).toBe(10240);
    expect(metrics.interfaces[0]?.txSec).toBe(5120);
  });

  it('인터페이스가 없으면 빈 배열을 반환해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.networkStats).mockResolvedValue([]);

    const metrics = await collector.collect();

    expect(metrics.interfaces).toHaveLength(0);
  });

  it('rx_sec/tx_sec가 null이면 0으로 처리해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.networkStats).mockResolvedValue([
      {
        iface: 'eth0',
        operstate: 'up',
        rx_bytes: 0,
        rx_dropped: 0,
        rx_errors: 0,
        tx_bytes: 0,
        tx_dropped: 0,
        tx_errors: 0,
        rx_sec: null,
        tx_sec: null,
        ms: 0,
      },
    ] as any);

    const metrics = await collector.collect();

    expect(metrics.interfaces[0]?.rxSec).toBe(0);
    expect(metrics.interfaces[0]?.txSec).toBe(0);
  });
});
