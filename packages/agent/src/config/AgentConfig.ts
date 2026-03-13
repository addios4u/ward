import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 에이전트 설정 타입 정의
export interface LogConfig {
  path: string;
  type: string;
}

// 설정 (ward start로 설정, ~/.ward/config.json에 저장)
export interface AgentConfig {
  server: {
    url: string;        // Ward 서버 URL
    groupName?: string; // --name 플래그 값
  };
  metrics: {
    interval: number;   // 메트릭 수집 주기 (초)
  };
  logs: LogConfig[];
}

// 하위 호환성을 위한 별칭
export type AgentConfigData = AgentConfig;

// 상태 (자동 등록 후 저장, ~/.ward/state.json에 저장)
export interface AgentState {
  serverId: string;   // Ward 서버에서 발급받은 서버 ID
  serverUrl: string;  // 등록된 서버 URL
  hostname: string;   // 이 서버의 hostname
}

// 기본 설정값
const DEFAULT_CONFIG: AgentConfig = {
  server: {
    url: 'http://localhost:3000',
  },
  metrics: {
    interval: 30,
  },
  logs: [],
};

// Ward 설정 디렉토리 경로
export function getWardDir(): string {
  return path.join(os.homedir(), '.ward');
}

// 설정 파일 경로 (JSON)
export function getConfigPath(): string {
  return path.join(getWardDir(), 'config.json');
}

// 상태 파일 경로
export function getStatePath(): string {
  return path.join(getWardDir(), 'state.json');
}

// PID 파일 경로
export function getPidPath(): string {
  return path.join(getWardDir(), 'agent.pid');
}

// 설정 파일 로드
export function loadConfig(): AgentConfig | null {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<AgentConfig>;

    return {
      server: {
        url: parsed?.server?.url ?? DEFAULT_CONFIG.server.url,
        groupName: parsed?.server?.groupName,
      },
      metrics: {
        interval: parsed?.metrics?.interval ?? DEFAULT_CONFIG.metrics.interval,
      },
      logs: parsed?.logs ?? DEFAULT_CONFIG.logs,
    };
  } catch (error) {
    console.error('설정 파일 로드 실패:', error);
    return null;
  }
}

// 설정 파일 저장
export function saveConfig(config: AgentConfig): void {
  const wardDir = getWardDir();

  // 디렉토리 생성
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// 상태 파일 로드
export function loadState(): AgentState | null {
  const statePath = getStatePath();

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as AgentState;
  } catch (error) {
    console.error('상태 파일 로드 실패:', error);
    return null;
  }
}

// 상태 파일 저장
export function saveState(state: AgentState): void {
  const wardDir = getWardDir();

  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  const statePath = getStatePath();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

// 설정 유효성 검사
export function validateConfig(config: AgentConfig): string[] {
  const errors: string[] = [];

  if (!config.server.url) {
    errors.push('서버 URL이 설정되지 않았습니다.');
  }

  if (config.metrics.interval < 1) {
    errors.push('메트릭 수집 주기는 1초 이상이어야 합니다.');
  }

  return errors;
}
