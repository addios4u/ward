// 에이전트 데몬 프로세스 - 백그라운드에서 실행
import { loadConfig } from './config/AgentConfig.js';
import { CpuCollector } from './metrics/CpuCollector.js';
import { MemoryCollector } from './metrics/MemoryCollector.js';
import { DiskCollector } from './metrics/DiskCollector.js';
import { NetworkCollector } from './metrics/NetworkCollector.js';
import { ProcessCollector } from './metrics/ProcessCollector.js';
import { HttpClient } from './transport/HttpClient.js';
import { Queue } from './transport/Queue.js';
import { LogWatcher } from './logs/LogWatcher.js';
import { LogForwarder } from './logs/LogForwarder.js';

// 각 수집기 인스턴스 생성
const cpuCollector = new CpuCollector();
const memoryCollector = new MemoryCollector();
const diskCollector = new DiskCollector();
const networkCollector = new NetworkCollector();
const processCollector = new ProcessCollector();

// 전송 실패 큐
const queue = new Queue({ maxSize: 1000, maxRetries: 3 });

let httpClient: HttpClient;
let metricsInterval: ReturnType<typeof setInterval>;
let heartbeatInterval: ReturnType<typeof setInterval>;
let logWatcher: LogWatcher;
let logForwarder: LogForwarder;

// 큐에 쌓인 데이터 재전송 시도
async function flushQueue(): Promise<void> {
  if (queue.isEmpty) return;

  const items = queue.dequeueAll();
  for (const item of items) {
    const result = await httpClient.post(item.path, item.data);
    if (!result.success) {
      // 재시도 가능하면 다시 큐에 추가
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
      processes,
    };

    const result = await httpClient.sendMetrics(payload);

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
async function sendHeartbeat(): Promise<void> {
  try {
    const payload = {
      sentAt: new Date().toISOString(),
      hostname: process.env['HOSTNAME'] ?? 'unknown',
    };

    const result = await httpClient.sendHeartbeat(payload);

    if (!result.success) {
      console.error(`Heartbeat 전송 실패: ${result.error}`);
    }
  } catch (error) {
    console.error('Heartbeat 전송 오류:', error);
  }
}

// 데몬 시작
export async function startDaemon(): Promise<void> {
  const config = loadConfig();

  httpClient = new HttpClient({
    serverUrl: config.server.url,
    apiKey: config.server.apiKey,
  });

  console.log('Ward 에이전트 데몬 시작');
  console.log(`서버: ${config.server.url}`);
  console.log(`메트릭 수집 주기: ${config.metrics.interval}초`);

  // LogWatcher/LogForwarder 초기화 및 연결
  logWatcher = new LogWatcher();
  logForwarder = new LogForwarder({ client: httpClient });

  // 설정의 logs 배열로 로그 파일 감시 등록
  for (const logConfig of config.logs) {
    logWatcher.watch(logConfig.path, logConfig.type);
  }

  // LogWatcher 이벤트를 LogForwarder에 연결
  logWatcher.on('line', (source: string, line: string) => {
    logForwarder.addLog(source, line);
  });

  // LogForwarder 시작
  logForwarder.start();

  // 메트릭 수집 인터벌 설정
  metricsInterval = setInterval(
    collectAndSendMetrics,
    config.metrics.interval * 1000
  );

  // Heartbeat 인터벌 설정 (30초)
  heartbeatInterval = setInterval(sendHeartbeat, 30000);

  // 즉시 첫 번째 수집 실행
  await collectAndSendMetrics();
  await sendHeartbeat();
}

// 종료 시그널 처리
process.on('SIGTERM', () => {
  console.log('에이전트 데몬 종료 중...');
  clearInterval(metricsInterval);
  clearInterval(heartbeatInterval);
  logWatcher?.unwatchAll();
  void logForwarder?.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('에이전트 데몬 인터럽트...');
  clearInterval(metricsInterval);
  clearInterval(heartbeatInterval);
  logWatcher?.unwatchAll();
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
