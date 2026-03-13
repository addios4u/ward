import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import {
  loadConfig,
  saveConfig,
  saveState,
  getWardDir,
  getPidPath,
} from '../config/AgentConfig.js';
import { HttpClient } from '../transport/HttpClient.js';
import { setupSystemd } from './systemd.js';

// 에이전트가 이미 실행 중인지 확인
export function isAgentRunning(): boolean {
  const pidPath = getPidPath();

  if (!fs.existsSync(pidPath)) {
    return false;
  }

  try {
    const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      return false;
    }

    // 프로세스 존재 여부 확인 (시그널 0 전송)
    process.kill(pid, 0);
    return true;
  } catch {
    // 프로세스가 존재하지 않으면 PID 파일 삭제
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // 파일 삭제 실패는 무시
    }
    return false;
  }
}

// URL 정규화 (http:// 또는 https:// 없으면 https:// 자동 추가)
export function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// Ward 서버에 등록 시도
async function registerWithServer(
  serverUrl: string,
  hostname: string,
  groupName?: string
): Promise<{ success: boolean; serverId?: string; error?: string }> {
  try {
    const tempClient = new HttpClient({ serverUrl, serverId: '' });
    const result = await tempClient.register(hostname, groupName);
    return { success: true, serverId: result.serverId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

// ward start <serverUrl> [--name <groupName>]
export async function start(serverUrl: string, options: { name?: string } = {}): Promise<void> {
  // 1. 서버 URL 정규화
  const normalizedUrl = normalizeUrl(serverUrl);

  // 2. 이미 실행 중인지 확인
  if (isAgentRunning()) {
    console.log('에이전트가 이미 실행 중입니다.');
    return;
  }

  // 3. Ward 디렉토리 생성
  const wardDir = getWardDir();
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  // 4. 자동 등록
  const hostname = os.hostname();
  const registerResult = await registerWithServer(normalizedUrl, hostname, options.name);

  if (!registerResult.success) {
    console.warn(`서버 등록 실패: ${registerResult.error}`);
    console.warn('데몬을 시작하고 서버가 올라오면 자동으로 재시도합니다.');
  }

  // 5. state 저장
  saveState({
    serverId: registerResult.serverId ?? '',
    serverUrl: normalizedUrl,
    hostname,
  });

  // 6. config 저장
  saveConfig({
    server: { url: normalizedUrl, groupName: options.name },
    metrics: { interval: 30 },
    logs: [],
  });

  // 7. 데몬 프로세스 시작
  const daemonScript = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../daemon.js'
  );

  const child = spawn('node', [daemonScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WARD_DAEMON: 'true' },
  });

  child.unref();

  if (child.pid === undefined) {
    console.error('에이전트 시작 실패: 프로세스 PID를 가져올 수 없습니다.');
    process.exit(1);
    return;
  }

  // PID 파일 저장
  const pidPath = getPidPath();
  fs.writeFileSync(pidPath, String(child.pid), 'utf-8');

  console.log(`에이전트가 시작되었습니다. (PID: ${child.pid})`);
  console.log(`서버: ${normalizedUrl}`);

  // 8. systemd 서비스 등록 (Linux 전용)
  if (process.platform === 'linux') {
    await setupSystemd(normalizedUrl, options.name);
  }
}
