import { LogEntry } from '../types/index.js';
import { HttpClient } from '../transport/HttpClient.js';
import { Queue } from '../transport/Queue.js';

// 로그 포워더 옵션
export interface LogForwarderOptions {
  client: HttpClient;
  batchSize?: number;   // 배치 크기 (기본값: 100)
  flushIntervalMs?: number; // 플러시 주기 ms (기본값: 5000)
}

// 로그 라인을 버퍼에 쌓다가 배치로 서버에 전송
export class LogForwarder {
  private readonly client: HttpClient;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly queue: Queue;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LogForwarderOptions) {
    this.client = options.client;
    this.batchSize = options.batchSize ?? 100;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.queue = new Queue({ maxSize: 10000, maxRetries: 3 });
  }

  // 포워더 시작 (주기적 플러시 타이머 등록)
  start(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      void this._flush();
    }, this.flushIntervalMs);
  }

  // 포워더 중단
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // 남은 버퍼 전송 시도
    await this._flush();
  }

  // 로그 라인 추가
  addLog(source: string, line: string, level = 'info'): void {
    const entry: LogEntry = {
      source,
      level,
      message: line,
      loggedAt: new Date().toISOString(),
    };

    this.buffer.push(entry);

    // 배치 크기 도달 시 즉시 전송
    if (this.buffer.length >= this.batchSize) {
      void this._flush();
    }
  }

  // 현재 버퍼 크기 (테스트용)
  get bufferSize(): number {
    return this.buffer.length;
  }

  // 내부: 버퍼를 서버로 전송
  private async _flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);

    // 먼저 큐에 쌓인 실패 항목 재전송 시도
    await this._retryQueue();

    const result = await this.client.post('/api/agent/logs', { logs: batch });

    if (!result.success) {
      // 전송 실패 시 큐에 버퍼링
      this.queue.enqueue('/api/agent/logs', { logs: batch });
      console.error('[LogForwarder] 로그 전송 실패, 큐에 저장:', result.error);
    }
  }

  // 내부: 큐에 쌓인 항목 재전송
  private async _retryQueue(): Promise<void> {
    if (this.queue.isEmpty) return;

    const items = this.queue.dequeueAll();
    for (const item of items) {
      const result = await this.client.post(item.path, item.data);
      if (!result.success) {
        // 재시도 횟수 초과 시 폐기
        this.queue.requeueItem(item);
      }
    }
  }
}
