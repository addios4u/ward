import * as fs from 'fs';
import { getPidPath } from '../config/AgentConfig.js';
import { loadState } from '../config/AgentConfig.js';
import { HttpClient } from '../transport/HttpClient.js';
import { removeSystemd } from './systemd.js';

// 서버에 등록 해제 요청
async function unregisterFromServer(serverUrl: string, serverId: string): Promise<void> {
  const client = new HttpClient({ serverUrl, serverId });
  await client.unregister().catch(() => {});
}

// ward stop - 에이전트 중지
export async function stop(): Promise<void> {
  // 1. state 로드해서 serverId 확인
  const state = loadState();

  // 2. 서버에 unregister 요청 (실패해도 계속 진행)
  if (state?.serverId) {
    await unregisterFromServer(state.serverUrl, state.serverId).catch(() => {});
  }

  const pidPath = getPidPath();

  // 3. 데몬 프로세스 종료 (SIGTERM)
  if (!fs.existsSync(pidPath)) {
    console.log('에이전트가 실행 중이지 않습니다.');
  } else {
    try {
      const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) {
        console.error('PID 파일이 손상되었습니다.');
      } else {
        process.kill(pid, 'SIGTERM');

        // 데몬(및 자식 프로세스)이 완전히 종료될 때까지 대기 (최대 8초)
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 300));
          try { process.kill(pid, 0); } catch { break; } // 프로세스 사라지면 종료
        }
        console.log(`에이전트가 중지되었습니다. (PID: ${pid})`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log('에이전트가 이미 종료되어 있습니다.');
      } else {
        console.error('에이전트 중지 실패:', error);
      }
    }
  }

  // 4. systemd 서비스 비활성화 (Linux 전용)
  if (process.platform === 'linux') {
    await removeSystemd().catch(() => {});
  }

  // 5. state 파일 삭제
  try {
    const { getStatePath } = await import('../config/AgentConfig.js');
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  } catch {
    // 무시
  }

  // 6. PID 파일 삭제
  try {
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
    }
  } catch {
    // 무시
  }
}
