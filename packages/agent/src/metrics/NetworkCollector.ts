import si from 'systeminformation';

// 네트워크 인터페이스 메트릭 타입 정의
export interface NetworkInterfaceMetrics {
  interface: string;    // 인터페이스명
  rxBytes: number;      // 수신 바이트
  txBytes: number;      // 송신 바이트
  rxSec: number;        // 초당 수신 바이트
  txSec: number;        // 초당 송신 바이트
}

export interface NetworkMetrics {
  interfaces: NetworkInterfaceMetrics[];
}

// 네트워크 메트릭 수집기
export class NetworkCollector {
  // 네트워크 인터페이스별 송수신량 수집
  async collect(): Promise<NetworkMetrics> {
    const netStats = await si.networkStats();

    const interfaces: NetworkInterfaceMetrics[] = netStats.map((stat) => ({
      interface: stat.iface,
      rxBytes: stat.rx_bytes,
      txBytes: stat.tx_bytes,
      rxSec: Math.round((stat.rx_sec ?? 0) * 100) / 100,
      txSec: Math.round((stat.tx_sec ?? 0) * 100) / 100,
    }));

    return { interfaces };
  }
}
