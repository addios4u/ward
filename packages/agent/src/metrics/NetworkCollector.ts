import si from 'systeminformation';

// 네트워크 인터페이스별 메트릭 타입 정의
export interface NetworkInterfaceInfo {
  rx: number;  // 수신 바이트
  tx: number;  // 송신 바이트
}

// 네트워크 메트릭: 인터페이스명을 키로 사용하는 Record
export type NetworkMetrics = Record<string, NetworkInterfaceInfo>;

// 네트워크 메트릭 수집기
export class NetworkCollector {
  // 네트워크 인터페이스별 송수신량 수집
  async collect(): Promise<NetworkMetrics> {
    const netStats = await si.networkStats();

    const result: NetworkMetrics = {};

    for (const stat of netStats) {
      result[stat.iface] = {
        rx: stat.rx_bytes,
        tx: stat.tx_bytes,
      };
    }

    return result;
  }
}
