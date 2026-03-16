// 에이전트 데몬 프로세스 - 백그라운드에서 실행
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pidusage from 'pidusage';
import { loadConfig, loadState } from './config/AgentConfig.js';
import { CpuCollector } from './metrics/CpuCollector.js';
import { MemoryCollector } from './metrics/MemoryCollector.js';
import { DiskCollector } from './metrics/DiskCollector.js';
import { NetworkCollector } from './metrics/NetworkCollector.js';
import { ProcessCollector } from './metrics/ProcessCollector.js';
import { IpCollector } from './metrics/IpCollector.js';
import { HttpClient, SendResult } from './transport/HttpClient.js';
import { ReconnectManager } from './transport/ReconnectManager.js';
import { Queue } from './transport/Queue.js';
import { LogForwarder } from './logs/LogForwarder.js';
import { ServiceWatcher } from './logs/ServiceWatcher.js';

// 각 수집기 인스턴스 생성
const cpuCollector = new CpuCollector();
const memoryCollector = new MemoryCollector();
const diskCollector = new DiskCollector();
const networkCollector = new NetworkCollector();
const processCollector = new ProcessCollector();
const ipCollector = new IpCollector();

// 전송 실패 큐
const queue = new Queue({ maxSize: 1000, maxRetries: 3 });

let httpClient: HttpClient;
let reconnectManager: ReconnectManager;
let metricsInterval: ReturnType<typeof setInterval>;
let heartbeatInterval: ReturnType<typeof setInterval>;
let serviceWatcher: ServiceWatcher;
let logForwarder: LogForwarder;
let currentHostname: string;

// 큐에 쌓인 데이터 재전송 시도
async function flushQueue(): Promise<void> {
  if (queue.isEmpty) return;

  const items = queue.dequeueAll();
  for (const item of items) {
    const result = await httpClient.post(item.path, item.data);
    reconnectManager.reportResult(result);
    if (!result.success) {
      queue.requeueItem(item);
    }
  }
}

// 메트릭 수집 및 전송
async function collectAndSendMetrics(): Promise<void> {
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
      cpu,
      memory,
      disk,
      network,
      processes: processes.processes, // 서버는 배열을 기대함
    };

    const result = await httpClient.sendMetrics(payload);
    reconnectManager.reportResult(result);

    if (!result.success) {
      // 전송 실패 시 큐에 저장
      queue.enqueue('/api/agent/metrics', payload);
      console.error(`메트릭 전송 실패: ${result.error}`);
    } else {
      // 전송 성공 시 큐 데이터도 함께 전송 시도
      await flushQueue();
    }
  } catch (error) {
    console.error('메트릭 수집 오류:', error);
  }
}

// 서비스 목록을 서버에 동기화
async function syncServicesToServer(): Promise<void> {
  const config = loadConfig();
  const services = config?.services ?? [];

  const servicePayloads = await Promise.all(services.map(async (svc) => {
    const statusInfo = serviceWatcher?.getServiceStatus(svc.name) ?? { status: 'unknown' as const, restartCount: 0 };

    let cpuUsage: number | undefined;
    let memUsage: number | undefined;

    if (statusInfo.pid && svc.method === 'exec') {
      try {
        const stats = await pidusage(statusInfo.pid);
        cpuUsage = stats.cpu;
        memUsage = stats.memory;
      } catch {
        // PID가 없거나 접근 불가
      }
    }

    return {
      name: svc.name,
      type: svc.method,
      config: svc as object,
      status: statusInfo.status,
      pid: statusInfo.pid,
      restartCount: statusInfo.restartCount,
      startedAt: statusInfo.startedAt?.toISOString(),
      cpuUsage,
      memUsage,
    };
  }));

  const result = await httpClient.syncServices(servicePayloads);
  if (!result.success) {
    console.error(`서비스 동기화 실패: ${result.error}`);
  }
}

// heartbeat 응답의 commands 처리
async function handleHeartbeatCommands(result: SendResult & { commands?: Array<{ id: string; serviceName: string; action: string }> }): Promise<void> {
  if (!result.commands || result.commands.length === 0) return;

  for (const cmd of result.commands) {
    console.log(`명령 수신: ${cmd.serviceName} → ${cmd.action}`);
    if (cmd.action === 'restart') {
      serviceWatcher?.restart(cmd.serviceName);
      console.log(`서비스 재시작: ${cmd.serviceName}`);
    }
  }
}

// Heartbeat 전송
async function sendHeartbeat(): Promise<SendResult> {
  try {
    const ipInfo = await ipCollector.collect();
    const config = loadConfig();
    const serviceStatuses = await Promise.all((config?.services ?? []).map(async (svc) => {
      const statusInfo = serviceWatcher?.getServiceStatus(svc.name) ?? { status: 'unknown' as const, restartCount: 0 };

      let cpuUsage: number | undefined;
      let memUsage: number | undefined;

      if (statusInfo.pid && svc.method === 'exec') {
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

    const payload = {
      sentAt: new Date().toISOString(),
      hostname: currentHostname,
      ipInfo,
      services: serviceStatuses.length > 0 ? serviceStatuses : undefined,
    };

    const result = await httpClient.sendHeartbeat(payload);
    reconnectManager.reportResult(result);

    if (!result.success) {
      console.error(`Heartbeat 전송 실패: ${result.error}`);
    } else {
      await handleHeartbeatCommands(result);
    }
    return result;
  } catch (error) {
    console.error('Heartbeat 전송 오류:', error);
    return { success: false, error: String(error) };
  }
}

// 데몬 시작
export async function startDaemon(): Promise<void> {
  // state에서 serverId + serverUrl 로드
  const state = loadState();

  if (!state) {
    console.error('에이전트 상태가 없습니다. `ward start <서버 URL>`로 먼저 시작하세요.');
    process.exit(1);
    return;
  }

  const config = loadConfig();
  const interval = config?.metrics?.interval ?? 30;

  currentHostname = state.hostname ?? os.hostname();

  httpClient = new HttpClient({
    serverUrl: state.serverUrl,
    serverId: state.serverId,
  });

  reconnectManager = new ReconnectManager(async () => {
    await sendHeartbeat();
  });

  console.log('Ward 에이전트 데몬 시작');
  console.log(`서버: ${state.serverUrl}`);
  console.log(`메트릭 수집 주기: ${interval}초`);

  // ServiceWatcher/LogForwarder 초기화 및 연결
  serviceWatcher = new ServiceWatcher();
  logForwarder = new LogForwarder({ client: httpClient });

  // 설정의 services 배열로 서비스 감시 등록
  for (const svc of config?.services ?? []) {
    serviceWatcher.watch(svc);
  }

  // ServiceWatcher 이벤트를 LogForwarder에 연결
  serviceWatcher.on('line', (source: string, line: string) => {
    logForwarder.addLog(source, line);
  });

  // 서비스 상태 변경 로그 출력
  serviceWatcher.on('status', (name: string, status: string, pid?: number, restartCount?: number, _startedAt?: Date) => {
    console.log(`서비스 상태 변경: ${name} → ${status}${pid ? ` (PID: ${pid})` : ''}${restartCount ? ` (재시작: ${restartCount}회)` : ''}`);
  });

  // LogForwarder 시작
  logForwarder.start();

  // 메트릭 수집 인터벌 설정
  metricsInterval = setInterval(collectAndSendMetrics, interval * 1000);

  // Heartbeat 인터벌 설정 (30초)
  heartbeatInterval = setInterval(sendHeartbeat, 30000);

  // 즉시 첫 번째 수집 실행
  await collectAndSendMetrics();
  await sendHeartbeat();
  await syncServicesToServer();
}

// SIGUSR2: ward service restart <name> 요청 처리
process.on('SIGUSR2', () => {
  const restartRequestPath = path.join(os.homedir(), '.ward', 'restart-request');
  try {
    if (!fs.existsSync(restartRequestPath)) return;
    const name = fs.readFileSync(restartRequestPath, 'utf-8').trim();
    fs.unlinkSync(restartRequestPath);
    if (!name) return;
    console.log(`서비스 재시작 요청: ${name}`);
    serviceWatcher?.restart(name);
  } catch (err) {
    console.error('서비스 재시작 요청 처리 오류:', err);
  }
});

// SIGUSR1: ward service add/remove 후 설정 재로드
process.on('SIGUSR1', () => {
  console.log('설정 재로드 중...');
  const newConfig = loadConfig();
  const services = newConfig?.services ?? [];
  // 기존 서비스 모두 해제 후 새 설정으로 재시작
  serviceWatcher?.unwatchAll();
  for (const svc of services) {
    serviceWatcher?.watch(svc);
  }
  console.log(`서비스 재로드 완료: ${services.map(s => s.name).join(', ') || '(없음)'}`);
  syncServicesToServer().catch(err => console.error('서비스 동기화 오류:', err));
});

// 종료 시그널 처리
process.on('SIGTERM', () => {
  console.log('에이전트 데몬 종료 중...');
  clearInterval(metricsInterval);
  clearInterval(heartbeatInterval);
  reconnectManager?.destroy();
  serviceWatcher?.unwatchAll();
  void logForwarder?.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('에이전트 데몬 인터럽트...');
  clearInterval(metricsInterval);
  clearInterval(heartbeatInterval);
  reconnectManager?.destroy();
  serviceWatcher?.unwatchAll();
  void logForwarder?.stop();
  process.exit(0);
});

// 데몬 실행 (직접 실행 시)
if (process.env['WARD_DAEMON'] === 'true') {
  startDaemon().catch((error) => {
    console.error('데몬 시작 실패:', error);
    process.exit(1);
  });
}
