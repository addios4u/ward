// 서버 상태 타입
export type ServerStatus = 'online' | 'offline' | 'unknown';

// 서버 정보 타입
export interface Server {
  id: string;
  name: string;
  hostname: string;
  groupName: string | null;   // 그룹명
  publicIp: string | null;    // 공인 IP
  country: string | null;     // 국가
  city: string | null;        // 도시
  isp: string | null;         // ISP
  status: ServerStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

// 메트릭 타입
export interface Metric {
  id: number;
  serverId: string;
  collectedAt: string;
  cpuUsage: number | null;
  memTotal: number | null;
  memUsed: number | null;
  diskUsage: Record<string, { total: number; used: number; free: number }> | null;
  networkIo: Record<string, { rx: number; tx: number }> | null;
  loadAvg: number[] | null;
}

// 프로세스 타입
export interface Process {
  id: number;
  serverId: string;
  collectedAt: string;
  pid: number;
  name: string;
  cpuUsage: number | null;
  memUsage: number | null;
}

// 로그 레벨 타입
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 로그 타입
export interface Log {
  id: number;
  serverId: string;
  source: string | null;
  level: string | null;
  message: string;
  loggedAt: string;
  createdAt: string;
}

// API 응답 타입
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ServersResponse {
  servers: Server[];
}

export interface MetricsResponse {
  metrics: Metric[];
}

export interface LogsResponse {
  logs: Log[];
  limit: number;
  offset: number;
}

export interface ServerStatusResponse {
  server: Omit<Server, 'createdAt'>;
  latestMetric: Metric | null;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

// WebSocket 메시지 타입
export interface WsMessage {
  type: 'metrics' | 'logs' | 'status';
  serverId: string;
  data: unknown;
}

// 서비스 프로세스 타입
export interface ServiceProcess {
  pid: number;
  name: string;
  cpuUsage: number | null;
  memUsage: number | null;
  collectedAt: string;
}

// 서비스 서버 타입
export interface ServiceServer {
  serverId: string;
  serverName: string;
  serverHostname: string;
  serverStatus: ServerStatus;
  processes: ServiceProcess[];
}

// 서비스 목록 응답 타입
export interface ServicesResponse {
  services: ServiceServer[];
}

// 관리자 계정 타입
export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
}
