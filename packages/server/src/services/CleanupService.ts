import { getDb } from '../db/index.js';
import { config } from '../config/index.js';
import { sql } from 'drizzle-orm';

// 오래된 메트릭, 프로세스, 로그를 주기적으로 삭제하는 서비스
export class CleanupService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly metricsDays: number;
  private readonly logsDays: number;
  // 1시간마다 실행
  private readonly intervalMs: number;

  constructor(options?: { metricsDays?: number; logsDays?: number; intervalMs?: number }) {
    this.metricsDays = options?.metricsDays ?? config.retention.metricsDays;
    this.logsDays = options?.logsDays ?? config.retention.logsDays;
    this.intervalMs = options?.intervalMs ?? 60 * 60 * 1000; // 기본값 1시간
  }

  // 서비스 시작 - 즉시 한 번 실행 후 주기적으로 반복
  start(): void {
    console.log(
      `데이터 정리 서비스 시작 (메트릭 보존: ${this.metricsDays}일, 로그 보존: ${this.logsDays}일)`
    );
    // 시작 시 즉시 한 번 실행
    this.cleanup().catch((err) => {
      console.error('초기 데이터 정리 실패:', err);
    });

    this.intervalId = setInterval(() => {
      this.cleanup().catch((err) => {
        console.error('주기적 데이터 정리 실패:', err);
      });
    }, this.intervalMs);
  }

  // 서비스 중지
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('데이터 정리 서비스 중지');
    }
  }

  // 오래된 데이터 삭제 실행 (TimescaleDB drop_chunks 사용 → 즉시 디스크 공간 해제)
  async cleanup(): Promise<{ deletedMetrics: number; deletedLogs: number; deletedProcesses: number }> {
    const db = getDb();

    await db.execute(sql`SELECT drop_chunks('metrics', make_interval(days => ${this.metricsDays}))`);
    await db.execute(sql`SELECT drop_chunks('processes', make_interval(days => ${this.metricsDays}))`);
    await db.execute(sql`SELECT drop_chunks('logs', make_interval(days => ${this.logsDays}))`);

    console.log(`데이터 정리 완료 (메트릭/프로세스: ${this.metricsDays}일, 로그: ${this.logsDays}일)`);

    return { deletedMetrics: 0, deletedLogs: 0, deletedProcesses: 0 };
  }
}
