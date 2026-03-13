// 에이전트 데몬 프로세스 - 백그라운드에서 실행
import * as os from 'os';
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

// Heartbeat 전송
async function sendHeartbeat(): Promise<SendResult> {
  try {
    const ipInfo = await ipCollector.collect();
    const payload = {
      sentAt: new Date().toISOString(),
      hostname: currentHostname,
      ipInfo,
    };

    const result = await httpClient.sendHeartbeat(payload);
    reconnectManager.reportResult(result);

    if (!result.success) {
      console.error(`Heartbeat 전송 실패: ${result.error}`);
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

  // LogForwarder 시작
  logForwarder.start();

  // 메트릭 수집 인터벌 설정
  metricsInterval = setInterval(collectAndSendMetrics, interval * 1000);

  // Heartbeat 인터벌 설정 (30초)
  heartbeatInterval = setInterval(sendHeartbeat, 30000);

  // 즉시 첫 번째 수집 실행
  await collectAndSendMetrics();
  await sendHeartbeat();
}

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
