import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  loadConfig,
  validateConfig,
  getWardDir,
  getPidPath,
} from '../config/AgentConfig.js';

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

// ward start - 에이전트 시작
export async function start(): Promise<void> {
  const config = loadConfig();

  // 설정 유효성 검사
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('설정 오류:');
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('\n`ward config init` 명령어로 설정을 초기화하세요.');
    process.exit(1);
  }

  // 이미 실행 중인지 확인
  if (isAgentRunning()) {
    console.log('에이전트가 이미 실행 중입니다.');
    return;
  }

  // Ward 디렉토리 생성
  const wardDir = getWardDir();
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  // 데몬 프로세스 시작
  const agentScriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../daemon.js'
  );

  // tsx를 통해 daemon.ts 실행
  const daemonScript = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../daemon.js'
  );

  const child = spawn('node', [daemonScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  child.unref();

  // child.pid가 undefined이면 에러 처리
  if (child.pid === undefined) {
    console.error('에이전트 시작 실패: 프로세스 PID를 가져올 수 없습니다.');
    process.exit(1);
    return;
  }

  // PID 파일 저장
  const pidPath = getPidPath();
  fs.writeFileSync(pidPath, String(child.pid), 'utf-8');

  console.log(`에이전트가 시작되었습니다. (PID: ${child.pid})`);
  console.log(`서버: ${config.server.url}`);
  console.log(`메트릭 수집 주기: ${config.metrics.interval}초`);
}
