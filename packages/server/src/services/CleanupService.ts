import { getDb } from '../db/index.js';
import { schema } from '../db/index.js';
import { config } from '../config/index.js';
import { lt } from 'drizzle-orm';

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

  // 오래된 데이터 삭제 실행
  async cleanup(): Promise<{ deletedMetrics: number; deletedLogs: number; deletedProcesses: number }> {
    const db = getDb();
    const now = new Date();

    // 메트릭 기준 날짜 (30일)
    const metricsThreshold = new Date(now);
    metricsThreshold.setDate(metricsThreshold.getDate() - this.metricsDays);

    // 로그 기준 날짜
    const logsThreshold = new Date(now);
    logsThreshold.setDate(logsThreshold.getDate() - this.logsDays);

    // processes도 30일 기준으로 정리
    const processesThreshold = new Date(now);
    processesThreshold.setDate(processesThreshold.getDate() - this.metricsDays);

    // 오래된 메트릭 삭제 (.returning() 제거로 메모리 절약)
    await db
      .delete(schema.metrics)
      .where(lt(schema.metrics.collectedAt, metricsThreshold));

    // 오래된 프로세스 삭제
    await db
      .delete(schema.processes)
      .where(lt(schema.processes.collectedAt, processesThreshold));

    // 오래된 로그 삭제
    await db
      .delete(schema.logs)
      .where(lt(schema.logs.loggedAt, logsThreshold));

    console.log('데이터 정리 완료');

    return { deletedMetrics: 0, deletedLogs: 0, deletedProcesses: 0 };
  }
}
