import readline from 'readline';
import { loadState } from '../config/AgentConfig.js';
import { HttpClient } from '../transport/HttpClient.js';
import { LogForwarder } from '../logs/LogForwarder.js';

// stdin을 읽어서 지정된 서비스 이름으로 로그 전송
// 사용 예: node app.js 2>&1 | ward pipe my-api
export async function pipe(serviceName: string): Promise<void> {
  const state = loadState();
  if (!state) {
    console.error('에이전트가 등록되지 않았습니다. ward start <url> 먼저 실행하세요.');
    process.exit(1);
    return;
  }

  const client = new HttpClient({
    serverUrl: state.serverUrl,
    serverId: state.serverId,
  });

  const forwarder = new LogForwarder({
    client,
    batchSize: 50,
    flushIntervalMs: 2000,
  });

  forwarder.start();

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  console.error(`[ward pipe] "${serviceName}" 로그 전송 시작 (Ctrl+C 또는 EOF로 종료)`);

  rl.on('line', (line) => {
    forwarder.addLog(serviceName, line);
  });

  const shutdown = async () => {
    rl.close();
    await forwarder.stop();
    process.exit(0);
  };

  rl.on('close', () => {
    void forwarder.stop().then(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}
