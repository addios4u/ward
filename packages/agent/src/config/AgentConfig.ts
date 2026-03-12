import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

// 에이전트 설정 타입 정의
export interface LogConfig {
  path: string;
  type: string;
}

export interface AgentConfigData {
  server: {
    url: string;
    apiKey: string;
  };
  metrics: {
    interval: number;
  };
  logs: LogConfig[];
}

// 기본 설정값
const DEFAULT_CONFIG: AgentConfigData = {
  server: {
    url: 'http://localhost:3000',
    apiKey: '',
  },
  metrics: {
    interval: 10,
  },
  logs: [],
};

// Ward 설정 디렉토리 경로
export function getWardDir(): string {
  return path.join(os.homedir(), '.ward');
}

// 설정 파일 경로
export function getConfigPath(): string {
  return path.join(getWardDir(), 'config.yaml');
}

// PID 파일 경로
export function getPidPath(): string {
  return path.join(getWardDir(), 'agent.pid');
}

// 설정 파일 로드
export function loadConfig(): AgentConfigData {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content) as Partial<AgentConfigData>;

    // 기본값과 병합
    return {
      server: {
        url: parsed?.server?.url ?? DEFAULT_CONFIG.server.url,
        apiKey: parsed?.server?.apiKey ?? DEFAULT_CONFIG.server.apiKey,
      },
      metrics: {
        interval: parsed?.metrics?.interval ?? DEFAULT_CONFIG.metrics.interval,
      },
      logs: parsed?.logs ?? DEFAULT_CONFIG.logs,
    };
  } catch (error) {
    console.error('설정 파일 로드 실패:', error);
    return { ...DEFAULT_CONFIG };
  }
}

// 설정 파일 저장
export function saveConfig(config: AgentConfigData): void {
  const wardDir = getWardDir();

  // 디렉토리 생성
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  const configPath = getConfigPath();
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
  });

  fs.writeFileSync(configPath, content, 'utf-8');
}

// 설정 유효성 검사
export function validateConfig(config: AgentConfigData): string[] {
  const errors: string[] = [];

  if (!config.server.url) {
    errors.push('서버 URL이 설정되지 않았습니다.');
  }

  if (!config.server.apiKey) {
    errors.push('API 키가 설정되지 않았습니다.');
  }

  if (config.metrics.interval < 1) {
    errors.push('메트릭 수집 주기는 1초 이상이어야 합니다.');
  }

  return errors;
}
