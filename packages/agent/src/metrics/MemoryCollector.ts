import si from 'systeminformation';

// 메모리 메트릭 타입 정의
export interface MemoryMetrics {
  total: number;      // 전체 메모리 (bytes)
  used: number;       // 사용 중인 메모리 (bytes)
  free: number;       // 여유 메모리 (bytes)
  usagePercent: number; // 사용률 (%)
  swapTotal: number;  // 스왑 전체 (bytes)
  swapUsed: number;   // 스왑 사용 (bytes)
}

// 메모리 메트릭 수집기
export class MemoryCollector {
  // 메모리 정보 수집
  async collect(): Promise<MemoryMetrics> {
    const mem = await si.mem();

    const usagePercent =
      mem.total > 0
        ? Math.round((mem.used / mem.total) * 10000) / 100
        : 0;

    return {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      usagePercent,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
    };
  }
}
