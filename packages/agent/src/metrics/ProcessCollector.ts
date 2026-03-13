import si from 'systeminformation';

// 프로세스 메트릭 타입 정의
export interface ProcessInfo {
  pid: number;      // 프로세스 ID
  name: string;     // 프로세스명
  cpu: number;      // CPU 사용률 (%)
  memory: number;   // 메모리 사용량 (bytes)
  status: string;   // 상태 (running, sleeping 등)
}

export interface ProcessMetrics {
  total: number;            // 전체 프로세스 수
  running: number;          // 실행 중인 프로세스 수
  processes: ProcessInfo[]; // 상위 프로세스 목록 (CPU 사용률 기준)
}

// 최대 수집할 프로세스 수
const MAX_PROCESSES = 50;

// 프로세스 메트릭 수집기
export class ProcessCollector {
  // 프로세스 목록 수집
  async collect(): Promise<ProcessMetrics> {
    const processData = await si.processes();

    // CPU 사용률 기준 상위 프로세스 정렬
    const sortedProcesses = processData.list
      .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
      .slice(0, MAX_PROCESSES)
      .map((proc) => ({
        pid: proc.pid,
        name: proc.name,
        cpu: Math.round((proc.cpu ?? 0) * 100) / 100,
        memory: proc.memRss ?? 0,
        status: proc.state ?? 'unknown',
      }));

    return {
      total: processData.all,
      running: processData.running,
      processes: sortedProcesses,
    };
  }
}
