import si from 'systeminformation';

// 디스크 마운트별 메트릭 타입 정의
export interface DiskMountInfo {
  total: number;        // 전체 용량 (bytes)
  used: number;         // 사용 용량 (bytes)
  free: number;         // 여유 용량 (bytes)
  usagePercent: number; // 사용률 (%)
}

// 디스크 메트릭: 마운트 포인트를 키로 사용하는 Record
export type DiskMetrics = Record<string, DiskMountInfo>;

// 디스크 메트릭 수집기
export class DiskCollector {
  // 디스크 사용량 수집
  async collect(): Promise<DiskMetrics> {
    const fsData = await si.fsSize();

    const result: DiskMetrics = {};

    for (const fs of fsData) {
      result[fs.mount] = {
        total: fs.size,
        used: fs.used,
        free: fs.size - fs.used,
        usagePercent: Math.round(fs.use * 100) / 100,
      };
    }

    return result;
  }
}
