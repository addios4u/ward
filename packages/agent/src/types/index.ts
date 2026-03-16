// 로그 엔트리 타입
export interface LogEntry {
  source: string;
  level: string;
  message: string;
  loggedAt: string;
}

// 메트릭 페이로드 타입
export interface MetricsPayload {
  collectedAt: string;
  cpu: { usage: number; loadAvg: number[] };
  memory: { total: number; used: number; free: number };
  disk: Record<string, { total: number; used: number; free: number }>;
  network: Record<string, { rx: number; tx: number }>;
  processes: Array<{ pid: number; name: string; cpu: number; memory: number; status: string }>;
}
