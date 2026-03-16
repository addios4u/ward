import fs from 'fs';
import {
  loadConfig,
  loadState,
  saveConfig,
  addService,
  removeService,
  getPidPath,
  type AgentConfig,
  type ServiceConfig,
} from '../config/AgentConfig.js';
import { HttpClient } from '../transport/HttpClient.js';

// 실행 중인 데몬에 SIGUSR1 시그널 전송 (설정 재로드)
function signalDaemon(): void {
  const pidPath = getPidPath();
  if (!fs.existsSync(pidPath)) return;
  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
    process.kill(pid, 'SIGUSR1');
    console.log('데몬에 설정 재로드 시그널을 전송했습니다.');
  } catch {
    // 데몬이 없으면 무시
  }
}

// 현재 config 로드 (없으면 빈 config 반환)
function getConfig(): AgentConfig {
  return loadConfig() ?? {
    server: { url: '' },
    metrics: { interval: 30 },
    services: [],
  };
}

// ward service add <name> [옵션들]
function parseMemSize(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([KMGkmg]?)B?$/);
  if (!match) throw new Error(`메모리 크기 형식 오류: "${value}" (예: 500M, 1G, 512K)`);
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  return Math.floor(num * multiplier[unit]);
}

export async function serviceAdd(
  name: string,
  options: {
    log?: string[];
    exec?: string;
    cwd?: string;
    journal?: string;
    docker?: string;
    maxMem?: string;
  }
): Promise<void> {
  const config = getConfig();

  let service: ServiceConfig;

  if (options.exec) {
    const maxMemBytes = options.maxMem ? parseMemSize(options.maxMem) : undefined;
    service = { name, method: 'exec', command: options.exec, restartDelay: 3000, ...(maxMemBytes ? { maxMemBytes } : {}) };
  } else if (options.journal) {
    service = { name, method: 'journal', unit: options.journal };
  } else if (options.docker) {
    service = { name, method: 'docker', container: options.docker };
  } else if (options.log && options.log.length > 0) {
    service = { name, method: 'file', paths: options.log };
  } else {
    console.error('서비스 타입을 지정하세요:');
    console.error('  --log <경로>      로그 파일 감시');
    console.error('  --exec <명령어>   프로세스 실행 및 stdout/stderr 수집');
    console.error('  --journal <유닛>  systemd 유닛 로그 수집');
    console.error('  --docker <컨테이너>  도커 컨테이너 로그 수집');
    process.exit(1);
    return;
  }

  const newConfig = addService(config, service);
  saveConfig(newConfig);

  console.log(`서비스 "${name}" (${service.method}) 등록 완료.`);

  // 서버에 서비스 목록 동기화 시도
  const state = loadState();
  if (state) {
    const client = new HttpClient({ serverUrl: state.serverUrl, serverId: state.serverId });
    const allServices = newConfig.services.map(svc => ({
      name: svc.name,
      type: svc.method,
      config: svc as object,
      status: 'unknown' as const,
    }));
    await client.syncServices(allServices).catch(() => {
      // 서버 미연결 시 무시 (데몬이 시작될 때 sync됨)
    });
  }

  signalDaemon();
}

// ward service remove <name>
export async function serviceRemove(name: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error('설정 파일이 없습니다. ward start 먼저 실행하세요.');
    process.exit(1);
    return;
  }

  const exists = config.services.some(s => s.name === name);
  if (!exists) {
    console.error(`서비스 "${name}"을 찾을 수 없습니다.`);
    process.exit(1);
    return;
  }

  const newConfig = removeService(config, name);
  saveConfig(newConfig);
  console.log(`서비스 "${name}" 제거 완료.`);

  // 서버에 서비스 목록 동기화 시도
  const state = loadState();
  if (state) {
    const client = new HttpClient({ serverUrl: state.serverUrl, serverId: state.serverId });
    const remainingServices = newConfig.services.map(svc => ({
      name: svc.name,
      type: svc.method,
      config: svc as object,
      status: 'unknown' as const,
    }));
    await client.syncServices(remainingServices).catch(() => {});
  }

  signalDaemon();
}

// ward service list
export function serviceList(): void {
  const config = loadConfig();
  if (!config || config.services.length === 0) {
    console.log('등록된 서비스가 없습니다.');
    return;
  }

  console.log('\n등록된 서비스 목록:');
  console.log('─'.repeat(60));
  for (const svc of config.services) {
    let detail = '';
    if (svc.method === 'file')    detail = svc.paths.join(', ');
    if (svc.method === 'exec')    detail = svc.command;
    if (svc.method === 'journal') detail = svc.unit;
    if (svc.method === 'docker')  detail = svc.container;
    if (svc.method === 'pipe')    detail = svc.command;
    console.log(`  ${svc.name.padEnd(20)} [${svc.method}]  ${detail}`);
  }
  console.log('─'.repeat(60));
}
