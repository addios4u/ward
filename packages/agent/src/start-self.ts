// Ward self-monitoring: Ward 서버 자신을 모니터링 대상으로 등록하고 에이전트 인라인 실행
import * as fs from 'fs';
import * as os from 'os';
import { saveState, saveConfig, getWardDir } from './config/AgentConfig.js';
import { HttpClient } from './transport/HttpClient.js';
import { startDaemon } from './daemon.js';

const SERVER_URL = process.env['AGENT_SERVER_URL'] ?? 'http://localhost:4000';
const GROUP_NAME = process.env['AGENT_GROUP_NAME'] ?? 'ward';
const HOSTNAME = os.hostname();
const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 20; // 최대 1분 대기

async function registerWithRetry(): Promise<string> {
  const client = new HttpClient({ serverUrl: SERVER_URL, serverId: '' });

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await client.register(HOSTNAME, GROUP_NAME);
      console.log(`[에이전트] 서버 등록 완료 (serverId: ${result.serverId})`);
      return result.serverId;
    } catch {
      if (i < MAX_RETRIES - 1) {
        console.log(`[에이전트] 서버 연결 대기 중... (${i + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
      }
    }
  }

  console.warn('[에이전트] 서버 등록 실패. 에이전트는 계속 재시도합니다.');
  return '';
}

async function main() {
  const wardDir = getWardDir();
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  const serverId = await registerWithRetry();

  saveState({ serverId, serverUrl: SERVER_URL, hostname: HOSTNAME });
  saveConfig({
    server: { url: SERVER_URL, groupName: GROUP_NAME },
    metrics: { interval: 30 },
    services: [],
  });

  // 포그라운드에서 데몬 실행 (concurrently가 생명주기 관리)
  process.env['WARD_DAEMON'] = 'true';
  await startDaemon();
}

main().catch((err) => {
  console.error('[에이전트] 시작 실패:', err);
  process.exit(1);
});
