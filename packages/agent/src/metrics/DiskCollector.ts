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

// 가상/시스템 전용 파일시스템 타입 (수집 제외)
const SKIP_FS_TYPES = new Set([
  'devfs', 'tmpfs', 'overlay', 'squashfs', 'tracefs', 'sysfs',
  'proc', 'cgroup', 'cgroup2', 'pstore', 'debugfs', 'securityfs',
  'hugetlbfs', 'mqueue', 'fusectl', 'configfs', 'autofs',
]);

// 노이즈 마운트 포인트 접두사 (수집 제외)
const SKIP_MOUNT_PREFIXES = [
  '/Library/Developer/',       // Xcode / iOS 시뮬레이터 이미지
  '/System/Volumes/VM',        // macOS 가상 메모리 볼륨
  '/System/Volumes/Preboot',   // macOS 부트 볼륨
  '/System/Volumes/Hardware',  // macOS 하드웨어 볼륨
  '/System/Volumes/iSCPreboot',
  '/System/Volumes/xarts',
  '/System/Volumes/Update',    // macOS 업데이트 볼륨 (Update/mnt1, SFR/mnt1 포함)
];

// 디스크 메트릭 수집기
export class DiskCollector {
  // 디스크 사용량 수집
  async collect(): Promise<DiskMetrics> {
    const fsData = await si.fsSize();

    const result: DiskMetrics = {};

    for (const fs of fsData) {
      // 용량이 0인 항목 제외
      if (fs.size === 0) continue;
      // 가상 파일시스템 타입 제외
      if (SKIP_FS_TYPES.has(fs.type)) continue;
      // 노이즈 마운트 포인트 제외
      if (SKIP_MOUNT_PREFIXES.some((prefix) => fs.mount.startsWith(prefix))) continue;

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
