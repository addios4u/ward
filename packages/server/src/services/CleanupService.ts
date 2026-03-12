import { getDb } from '../db/index.js';
import { schema } from '../db/index.js';
import { config } from '../config/index.js';
import { lt } from 'drizzle-orm';

// 오래된 메트릭과 로그를 주기적으로 삭제하는 서비스
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

  // 오래된 데이터 삭제 실행
  async cleanup(): Promise<{ deletedMetrics: number; deletedLogs: number }> {
    const db = getDb();
    const now = new Date();

    // 메트릭 기준 날짜
    const metricsThreshold = new Date(now);
    metricsThreshold.setDate(metricsThreshold.getDate() - this.metricsDays);

    // 로그 기준 날짜
    const logsThreshold = new Date(now);
    logsThreshold.setDate(logsThreshold.getDate() - this.logsDays);

    // 오래된 메트릭 삭제
    const deletedMetricsResult = await db
      .delete(schema.metrics)
      .where(lt(schema.metrics.collectedAt, metricsThreshold))
      .returning({ id: schema.metrics.id });

    // 오래된 로그 삭제
    const deletedLogsResult = await db
      .delete(schema.logs)
      .where(lt(schema.logs.loggedAt, logsThreshold))
      .returning({ id: schema.logs.id });

    const deletedMetrics = deletedMetricsResult.length;
    const deletedLogs = deletedLogsResult.length;

    console.log(
      `데이터 정리 완료 - 메트릭 ${deletedMetrics}건, 로그 ${deletedLogs}건 삭제`
    );

    return { deletedMetrics, deletedLogs };
  }
}
