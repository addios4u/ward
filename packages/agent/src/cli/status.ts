import * as fs from 'fs';
import { getPidPath, loadConfig } from '../config/AgentConfig.js';
import { isAgentRunning } from './start.js';

// ward status - 에이전트 상태 확인
export function status(): void {
  const pidPath = getPidPath();
  const running = isAgentRunning();

  if (running) {
    const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
    const config = loadConfig();

    console.log('에이전트 상태: 실행 중');
    console.log(`PID: ${pidStr}`);
    console.log(`서버: ${config?.server.url ?? '-'}`);
    console.log(`메트릭 수집 주기: ${config?.metrics.interval ?? 30}초`);
  } else {
    console.log('에이전트 상태: 중지됨');
  }
}
