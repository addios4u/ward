import { getPubClient } from '../lib/redis.js';

/**
 * Redis 기반 로그인 시도 추적 및 IP 차단 서비스
 *
 * Redis 키 구조:
 * ward:login:attempts:{ip} → 실패 횟수 (TTL: 1시간)
 * ward:login:blocked:{ip}  → 차단 여부 (TTL: 1시간)
 */
export class LoginGuard {
  private readonly MAX_ATTEMPTS = 5;
  private readonly BLOCK_DURATION = 60 * 60; // 1시간 (초)

  private attemptsKey(ip: string): string {
    return `ward:login:attempts:${ip}`;
  }

  private blockedKey(ip: string): string {
    return `ward:login:blocked:${ip}`;
  }

  /**
   * IP가 차단되었는지 확인
   */
  async isBlocked(ip: string): Promise<boolean> {
    const client = getPubClient();
    const value = await client.get(this.blockedKey(ip));
    return value !== null;
  }

  /**
   * 로그인 실패 기록 (MAX_ATTEMPTS 달성 시 자동 차단)
   */
  async recordFailure(ip: string): Promise<{ blocked: boolean; attemptsLeft: number }> {
    const client = getPubClient();
    const attempts = await client.incr(this.attemptsKey(ip));
    // 첫 번째 실패 시 TTL 설정 (이후에도 매번 갱신하여 활동 기준으로 만료)
    await client.expire(this.attemptsKey(ip), this.BLOCK_DURATION);

    if (attempts >= this.MAX_ATTEMPTS) {
      await client.set(this.blockedKey(ip), '1', 'EX', this.BLOCK_DURATION);
      return { blocked: true, attemptsLeft: 0 };
    }

    return { blocked: false, attemptsLeft: this.MAX_ATTEMPTS - attempts };
  }

  /**
   * 로그인 성공 시 실패 기록 초기화
   */
  async recordSuccess(ip: string): Promise<void> {
    const client = getPubClient();
    await client.del(this.attemptsKey(ip), this.blockedKey(ip));
  }

  /**
   * 차단 해제까지 남은 시간 (초). 차단 중이 아니면 0 반환.
   */
  async getBlockRemainingSeconds(ip: string): Promise<number> {
    const client = getPubClient();
    const ttl = await client.ttl(this.blockedKey(ip));
    return ttl > 0 ? ttl : 0;
  }

  /**
   * 현재 실패 횟수 반환
   */
  async getAttempts(ip: string): Promise<number> {
    const client = getPubClient();
    const value = await client.get(this.attemptsKey(ip));
    return value ? parseInt(value, 10) : 0;
  }
}
