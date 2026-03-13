import si from 'systeminformation';
import os from 'os';

// CPU 메트릭 타입 정의
export interface CpuMetrics {
  usage: number;          // 전체 CPU 사용률 (%)
  loadAvg: number[];      // load average [1m, 5m, 15m]
  cores: number;          // CPU 코어 수
}

// CPU 메트릭 수집기
export class CpuCollector {
  // CPU 사용률 및 load average 수집
  async collect(): Promise<CpuMetrics> {
    const currentLoad = await si.currentLoad();

    // Node.js os.loadavg()로 1분/5분/15분 load average 수집
    const [load1, load5, load15] = os.loadavg();

    return {
      usage: Math.round(currentLoad.currentLoad * 100) / 100,
      loadAvg: [load1, load5, load15],
      cores: currentLoad.cpus?.length ?? 0,
    };
  }
}
