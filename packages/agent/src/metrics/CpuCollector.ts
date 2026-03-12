import si from 'systeminformation';

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
    const [currentLoad, loadData] = await Promise.all([
      si.currentLoad(),
      si.currentLoad(), // load average는 currentLoad에 포함됨
    ]);

    // systeminformation의 load average 조회
    let loadAvg: number[] = [0, 0, 0];
    try {
      const osInfo = await si.osInfo();
      // Linux/macOS에서는 /proc/loadavg 또는 getloadavg() 사용
      const load = await si.currentLoad();
      // avgLoad는 1분 평균값
      loadAvg = [load.avgLoad ?? 0, load.avgLoad ?? 0, load.avgLoad ?? 0];
    } catch {
      // load average 수집 실패 시 0으로 처리
    }

    return {
      usage: Math.round(currentLoad.currentLoad * 100) / 100,
      loadAvg,
      cores: currentLoad.cpus?.length ?? 0,
    };
  }
}
