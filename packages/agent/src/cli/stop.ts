import * as fs from 'fs';
import { getPidPath } from '../config/AgentConfig.js';

// ward stop - 에이전트 중지
export function stop(): void {
  const pidPath = getPidPath();

  if (!fs.existsSync(pidPath)) {
    console.log('에이전트가 실행 중이지 않습니다.');
    return;
  }

  try {
    const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      console.error('PID 파일이 손상되었습니다.');
      fs.unlinkSync(pidPath);
      return;
    }

    // SIGTERM 시그널로 프로세스 종료
    process.kill(pid, 'SIGTERM');

    // PID 파일 삭제
    fs.unlinkSync(pidPath);

    console.log(`에이전트가 중지되었습니다. (PID: ${pid})`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ESRCH') {
      // 프로세스가 이미 종료된 경우
      console.log('에이전트가 이미 종료되어 있습니다.');
      try {
        fs.unlinkSync(pidPath);
      } catch {
        // PID 파일 삭제 실패는 무시
      }
    } else {
      console.error('에이전트 중지 실패:', error);
    }
  }
}
