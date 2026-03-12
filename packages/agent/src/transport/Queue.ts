// 전송 실패 시 데이터를 버퍼링하는 큐
export interface QueueItem {
  id: string;
  path: string;
  data: unknown;
  createdAt: number;
  retryCount: number;
}

export interface QueueOptions {
  maxSize?: number;       // 최대 큐 크기 (기본값: 1000)
  maxRetries?: number;    // 최대 재시도 횟수 (기본값: 3)
  maxAgeMs?: number;      // 최대 보존 시간 ms (기본값: 1시간)
}

// 메트릭 전송 실패 시 로컬 메모리 큐에 버퍼링
export class Queue {
  private items: QueueItem[] = [];
  private readonly maxSize: number;
  private readonly maxRetries: number;
  private readonly maxAgeMs: number;
  private idCounter = 0;

  constructor(options: QueueOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxAgeMs = options.maxAgeMs ?? 3600000; // 1시간
  }

  // 큐에 아이템 추가
  enqueue(path: string, data: unknown): QueueItem | null {
    // 최대 크기 초과 시 가장 오래된 항목 제거
    if (this.items.length >= this.maxSize) {
      this.items.shift();
    }

    const item: QueueItem = {
      id: `queue-${++this.idCounter}-${Date.now()}`,
      path,
      data,
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.items.push(item);
    return item;
  }

  // 큐에서 전송 가능한 아이템 조회 (오래된 항목 먼저)
  dequeue(): QueueItem | null {
    this.evictExpired();

    const item = this.items.shift();
    return item ?? null;
  }

  // 여러 아이템 일괄 조회
  dequeueAll(): QueueItem[] {
    this.evictExpired();
    const items = [...this.items];
    this.items = [];
    return items;
  }

  // 재시도 횟수 초과 시 큐에서 제거, 아직 가능하면 다시 추가
  requeueItem(item: QueueItem): boolean {
    if (item.retryCount >= this.maxRetries) {
      // 최대 재시도 횟수 초과 - 폐기
      return false;
    }

    item.retryCount++;
    this.items.push(item);
    return true;
  }

  // 만료된 아이템 제거
  private evictExpired(): void {
    const now = Date.now();
    this.items = this.items.filter(
      (item) => now - item.createdAt < this.maxAgeMs
    );
  }

  // 큐 크기 조회
  get size(): number {
    return this.items.length;
  }

  // 큐가 비어있는지 확인
  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  // 큐 전체 비우기
  clear(): void {
    this.items = [];
  }
}
