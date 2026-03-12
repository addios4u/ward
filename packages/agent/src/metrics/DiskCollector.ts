import si from 'systeminformation';

// 디스크 메트릭 타입 정의
export interface DiskMountMetrics {
  mount: string;        // 마운트 포인트
  device: string;       // 장치명
  total: number;        // 전체 용량 (bytes)
  used: number;         // 사용 용량 (bytes)
  free: number;         // 여유 용량 (bytes)
  usagePercent: number; // 사용률 (%)
}

export interface DiskMetrics {
  mounts: DiskMountMetrics[];
}

// 디스크 메트릭 수집기
export class DiskCollector {
  // 디스크 사용량 수집
  async collect(): Promise<DiskMetrics> {
    const fsData = await si.fsSize();

    const mounts: DiskMountMetrics[] = fsData.map((fs) => ({
      mount: fs.mount,
      device: fs.fs,
      total: fs.size,
      used: fs.used,
      free: fs.size - fs.used,
      usagePercent: Math.round(fs.use * 100) / 100,
    }));

    return { mounts };
  }
}
