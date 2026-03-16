import { getDb, schema } from '../db/index.js';
import { lt, eq, and } from 'drizzle-orm';
import { safePublish, REDIS_CHANNELS } from '../lib/redis.js';

/**
 * 서버 offline 감지 스케줄러
 * 1분마다 lastSeenAt이 2분 이상 지난 서버를 offline으로 업데이트
 */
export class HeartbeatMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  // 기본값: 1분마다 실행
  private readonly intervalMs: number;
  // offline 판정 기준: 2분 이상 응답 없음
  private readonly offlineThresholdMs: number;

  constructor(options?: { intervalMs?: number; offlineThresholdMs?: number }) {
    this.intervalMs = options?.intervalMs ?? 60 * 1000;
    this.offlineThresholdMs = options?.offlineThresholdMs ?? 2 * 60 * 1000;
  }

  start(): void {
    console.log('Heartbeat 모니터 시작');
    this.intervalId = setInterval(() => {
      this.check().catch((err) => {
        console.error('Heartbeat 체크 실패:', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Heartbeat 모니터 중지');
    }
  }

  async check(): Promise<{ markedOffline: number }> {
    const db = getDb();
    const threshold = new Date(Date.now() - this.offlineThresholdMs);

    // lastSeenAt이 threshold보다 오래된 online 서버를 offline으로 업데이트
    const updated = await db
      .update(schema.servers)
      .set({ status: 'offline' })
      .where(and(eq(schema.servers.status, 'online'), lt(schema.servers.lastSeenAt, threshold)))
      .returning({ id: schema.servers.id });

    if (updated.length > 0) {
      console.log(`${updated.length}개 서버를 offline으로 표시`);

      // 각 서버에 대해 Redis Pub/Sub 발행
      for (const server of updated) {
        await safePublish(
          REDIS_CHANNELS.serverStatus,
          JSON.stringify({ serverId: server.id, status: 'offline' })
        );
      }
    }

    return { markedOffline: updated.length };
  }
}
