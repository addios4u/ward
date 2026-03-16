// Ward self-monitoring: Ward 서버를 exec 서비스로 시작하고 메트릭/로그를 대시보드에 전송
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import pidusage from 'pidusage';
import { saveState, saveConfig, getWardDir } from './config/AgentConfig.js';
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
const GROUP_NAME = process.env['AGENT_GROUP_NAME'] ?? 'ward';
const METRICS_INTERVAL = parseInt(process.env['AGENT_METRICS_INTERVAL'] ?? '30', 10);
const HOSTNAME = os.hostname();
const RETRY_INTERVAL_MS = 3000;
const MAX_RETRIES = 60; // 최대 3분 대기

// Ward 서버 dist 경로 계산 (packages/agent/dist → packages/server/dist)
const serverDist = path.resolve(__dirname, '../../server/dist/index.js');

const WARD_SERVICES = [
  {
    name: 'ward-4000',
    method: 'exec' as const,
    command: `node ${serverDist}`,
    restartDelay: 3000,
    env: { SERVER_PORT: '4000' },
  },
  {
    name: 'ward-4001',
    method: 'exec' as const,
    command: `node ${serverDist}`,
    restartDelay: 3000,
    env: { SERVER_PORT: '4001', WARD_LEADER: 'false' },
  },
];

async function registerWithRetry(client: HttpClient): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await client.register(HOSTNAME, GROUP_NAME);
      console.log(`[에이전트] 서버 등록 완료 (serverId: ${result.serverId})`);
      return result.serverId;
    } catch {
      if (i < MAX_RETRIES - 1) {
        if (i % 5 === 0) console.log(`[에이전트] 서버 연결 대기 중... (${i + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
      }
    }
  }
  console.warn('[에이전트] 서버 등록 실패. 빈 serverId로 계속합니다.');
  return '';
}

async function main() {
  // Ward 디렉토리 생성
  const wardDir = getWardDir();
  if (!fs.existsSync(wardDir)) {
    fs.mkdirSync(wardDir, { recursive: true });
  }

  // Ward 서버 exec 서비스 설정 저장
  saveConfig({
    server: { url: SERVER_URL, groupName: GROUP_NAME },
    metrics: { interval: METRICS_INTERVAL },
    services: WARD_SERVICES.map(({ name, method, command, restartDelay }) => ({
      name, method, command, restartDelay,
    })),
  });

  // ServiceWatcher: Ward 서버 exec 서비스로 시작 (stdout/stderr 캡처)
  const serviceWatcher = new ServiceWatcher();

  // 각 서비스를 환경변수와 함께 실행하기 위해 spawn 래핑
  for (const svc of WARD_SERVICES) {
    const envStr = Object.entries(svc.env)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    const command = process.platform === 'win32'
      ? `node ${serverDist}`
      : `env ${envStr} node ${serverDist}`;

    serviceWatcher.watch({
      name: svc.name,
      method: 'exec',
      command,
      restartDelay: svc.restartDelay,
    });
  }

  console.log('[에이전트] Ward 서버 프로세스 시작 중...');

  // 서버 부팅 대기 후 등록
  const tempClient = new HttpClient({ serverUrl: SERVER_URL, serverId: '' });
  const serverId = await registerWithRetry(tempClient);

  saveState({ serverId, serverUrl: SERVER_URL, hostname: HOSTNAME });

  // 수집기 초기화
  const cpuCollector = new CpuCollector();
  const memoryCollector = new MemoryCollector();
  const diskCollector = new DiskCollector();
  const networkCollector = new NetworkCollector();
  const processCollector = new ProcessCollector();
  const ipCollector = new IpCollector();

  const queue = new Queue({ maxSize: 1000, maxRetries: 3 });
  const httpClient = new HttpClient({ serverUrl: SERVER_URL, serverId });

  // ward-4000, ward-4001 서비스를 DB에 등록 (서비스 탭에 표시되도록)
  await httpClient.syncServices(
    WARD_SERVICES.map(svc => ({
      name: svc.name,
      type: 'exec',
      config: { name: svc.name, method: 'exec', command: svc.command },
      status: 'running' as const,
    }))
  ).catch((err: Error) => console.warn('[에이전트] 서비스 동기화 실패:', err.message));

  // 로그 포워더: ServiceWatcher 이벤트 → Ward 서버로 전송
  const logForwarder = new LogForwarder({ client: httpClient });
  serviceWatcher.on('line', (source: string, line: string) => {
    logForwarder.addLog(source, line);
  });
  logForwarder.start();

  const reconnectManager = new ReconnectManager(async () => {
    const ipInfo = await ipCollector.collect();
    await httpClient.sendHeartbeat({
      sentAt: new Date().toISOString(),
      hostname: HOSTNAME,
      ipInfo,
    });
  });

  // 메트릭 수집 및 전송
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
        processes: processes.processes, // 서버는 배열을 기대함
      };
      const result = await httpClient.sendMetrics(payload);
      reconnectManager.reportResult(result);
      if (!result.success) {
        queue.enqueue('/api/agent/metrics', payload);
      }
    } catch (err) {
      console.error('[에이전트] 메트릭 수집 오류:', err);
    }
  }

  // Heartbeat 전송
  async function sendHeartbeat() {
    try {
      const ipInfo = await ipCollector.collect();
      const serviceStatuses = await Promise.all(WARD_SERVICES.map(async (svc) => {
        const statusInfo = serviceWatcher.getServiceStatus(svc.name);
        let cpuUsage: number | undefined;
        let memUsage: number | undefined;
        if (statusInfo.pid) {
          try {
            const stats = await pidusage(statusInfo.pid);
            cpuUsage = stats.cpu;
            memUsage = stats.memory;
          } catch { /* 무시 */ }
        }
        return {
          name: svc.name,
          status: statusInfo.status,
          pid: statusInfo.pid,
          restartCount: statusInfo.restartCount,
          startedAt: statusInfo.startedAt?.toISOString(),
          cpuUsage,
          memUsage,
        };
      }));
      const result = await httpClient.sendHeartbeat({
        sentAt: new Date().toISOString(),
        hostname: HOSTNAME,
        ipInfo,
        services: serviceStatuses,
      });
      reconnectManager.reportResult(result);
      if (result.success && result.commands && result.commands.length > 0) {
        for (const cmd of result.commands) {
          console.log(`[에이전트] 명령 수신: ${cmd.serviceName} → ${cmd.action}`);
          if (cmd.action === 'restart') {
            serviceWatcher.restart(cmd.serviceName);
            console.log(`[에이전트] 서비스 재시작: ${cmd.serviceName}`);
          }
        }
      }
    } catch (err) {
      console.error('[에이전트] Heartbeat 오류:', err);
    }
  }

  // 즉시 첫 실행
  await collectAndSend();
  await sendHeartbeat();

  const metricsTimer = setInterval(collectAndSend, METRICS_INTERVAL * 1000);
  const heartbeatTimer = setInterval(sendHeartbeat, 30 * 1000);

  console.log(`[에이전트] 모니터링 시작 (메트릭: ${METRICS_INTERVAL}초, 서비스: ${WARD_SERVICES.map(s => s.name).join(', ')})`);

  // 종료 처리
  const shutdown = () => {
    console.log('[에이전트] 종료 중...');
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
  console.error('[에이전트] 시작 실패:', err);
  process.exit(1);
});
