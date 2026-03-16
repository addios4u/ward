// 개발 모드 에이전트: Ward dev 서버를 직접 시작·감시하고 메트릭/로그를 대시보드에 전송
import * as os from 'os';
import * as path from 'path';
import pidusage from 'pidusage';
import { saveState } from './config/AgentConfig.js';
import { HttpClient } from './transport/HttpClient.js';
import { ReconnectManager } from './transport/ReconnectManager.js';
import { Queue } from './transport/Queue.js';
import { ServiceWatcher } from './logs/ServiceWatcher.js';
import { LogForwarder } from './logs/LogForwarder.js';
import { CpuCollector } from './metrics/CpuCollector.js';
import { MemoryCollector } from './metrics/MemoryCollector.js';
import { DiskCollector } from './metrics/DiskCollector.js';
import { NetworkCollector } from './metrics/NetworkCollector.js';
import { ProcessCollector } from './metrics/ProcessCollector.js';
import { IpCollector } from './metrics/IpCollector.js';

const SERVER_URL = process.env['AGENT_SERVER_URL'] ?? 'http://localhost:4000';
const GROUP_NAME = process.env['AGENT_GROUP_NAME'] ?? 'ward-dev';
const METRICS_INTERVAL = parseInt(process.env['AGENT_METRICS_INTERVAL'] ?? '15', 10);
const HOSTNAME = os.hostname();
const MAX_RETRIES = 60;
const RETRY_INTERVAL_MS = 3000;

// 서버 소스 경로 (packages/agent/src → packages/server/src)
const serverEntry = path.resolve(__dirname, '../../server/src/index.ts');

async function registerWithRetry(client: HttpClient): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await client.register(HOSTNAME, GROUP_NAME);
      console.log(`[dev-agent] 서버 등록 완료 (serverId: ${result.serverId})`);
      return result.serverId;
    } catch {
      if (i % 5 === 0) console.log(`[dev-agent] 서버 연결 대기 중... (${i + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    }
  }
  throw new Error('[dev-agent] 서버 등록 실패: 서버가 응답하지 않습니다.');
}

async function main() {
  console.log(`[dev-agent] Ward 개발 모드 에이전트 시작 (서버: ${SERVER_URL})`);

  // ServiceWatcher로 Ward dev 서버 시작 (tsx watch → 파일 변경 시 자동 재시작)
  const serviceWatcher = new ServiceWatcher();
  serviceWatcher.watch({
    name: 'ward-server',
    method: 'exec',
    command: `tsx watch ${serverEntry}`,
    restartDelay: 2000,
  });
  console.log('[dev-agent] Ward dev 서버 시작 중...');

  // 서버 부팅 대기 후 등록
  const tempClient = new HttpClient({ serverUrl: SERVER_URL, serverId: '' });
  const serverId = await registerWithRetry(tempClient);
  saveState({ serverId, serverUrl: SERVER_URL, hostname: HOSTNAME });

  const httpClient = new HttpClient({ serverUrl: SERVER_URL, serverId });
  const queue = new Queue({ maxSize: 1000, maxRetries: 3 });

  // ward-server 서비스를 DB에 등록 (서비스 탭에 표시되도록)
  await httpClient.syncServices([{
    name: 'ward-server',
    type: 'exec',
    config: { name: 'ward-server', method: 'exec', command: `tsx watch ${serverEntry}` },
    status: 'running',
  }]).catch((err: Error) => console.warn('[dev-agent] 서비스 동기화 실패:', err.message));

  // 로그 포워더: 서버 stdout/stderr → 대시보드
  const logForwarder = new LogForwarder({ client: httpClient });
  serviceWatcher.on('line', (source: string, line: string) => {
    logForwarder.addLog(source, line);
  });
  logForwarder.start();

  const cpuCollector = new CpuCollector();
  const memoryCollector = new MemoryCollector();
  const diskCollector = new DiskCollector();
  const networkCollector = new NetworkCollector();
  const processCollector = new ProcessCollector();
  const ipCollector = new IpCollector();

  const reconnectManager = new ReconnectManager(async () => {
    const ipInfo = await ipCollector.collect();
    await httpClient.sendHeartbeat({ sentAt: new Date().toISOString(), hostname: HOSTNAME, ipInfo });
  });

  async function collectAndSend() {
    try {
      const [cpu, memory, disk, network, processes] = await Promise.all([
        cpuCollector.collect(),
        memoryCollector.collect(),
        diskCollector.collect(),
        networkCollector.collect(),
        processCollector.collect(),
      ]);
      const payload = {
        collectedAt: new Date().toISOString(),
        cpu, memory, disk, network,
        processes: processes.processes,
      };
      const result = await httpClient.sendMetrics(payload);
      reconnectManager.reportResult(result);
      if (!result.success) queue.enqueue('/api/agent/metrics', payload);
    } catch (err) {
      console.error('[dev-agent] 메트릭 수집 오류:', err);
    }
  }

  async function sendHeartbeat() {
    try {
      const ipInfo = await ipCollector.collect();
      const statusInfo = serviceWatcher.getServiceStatus('ward-server');
      let cpuUsage: number | undefined;
      let memUsage: number | undefined;
      if (statusInfo.pid) {
        try {
          const stats = await pidusage(statusInfo.pid);
          cpuUsage = stats.cpu;
          memUsage = stats.memory;
        } catch { /* 무시 */ }
      }
      const result = await httpClient.sendHeartbeat({
        sentAt: new Date().toISOString(),
        hostname: HOSTNAME,
        ipInfo,
        services: [{
          name: 'ward-server',
          status: statusInfo.status,
          pid: statusInfo.pid,
          restartCount: statusInfo.restartCount,
          startedAt: statusInfo.startedAt?.toISOString(),
          cpuUsage,
          memUsage,
        }],
      });
      reconnectManager.reportResult(result);
      if (result.success && result.commands && result.commands.length > 0) {
        for (const cmd of result.commands) {
          console.log(`[dev-agent] 명령 수신: ${cmd.serviceName} → ${cmd.action}`);
          if (cmd.action === 'restart') {
            serviceWatcher.restart(cmd.serviceName);
            console.log(`[dev-agent] 서비스 재시작: ${cmd.serviceName}`);
          }
        }
      }
    } catch (err) {
      console.error('[dev-agent] Heartbeat 오류:', err);
    }
  }

  await collectAndSend();
  await sendHeartbeat();

  const metricsTimer = setInterval(collectAndSend, METRICS_INTERVAL * 1000);
  const heartbeatTimer = setInterval(sendHeartbeat, 30 * 1000);

  console.log(`[dev-agent] 모니터링 시작 (메트릭: ${METRICS_INTERVAL}초)`);

  const shutdown = () => {
    console.log('[dev-agent] 종료 중...');
    clearInterval(metricsTimer);
    clearInterval(heartbeatTimer);
    reconnectManager.destroy();
    serviceWatcher.unwatchAll();
    void logForwarder.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[dev-agent] 시작 실패:', err);
  process.exit(1);
});
