import { describe, it, expect, vi, beforeEach } from 'vitest';

// Redis 클라이언트 모킹
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
  ttl: vi.fn(),
};

vi.mock('../../src/lib/redis.js', () => ({
  getPubClient: vi.fn().mockReturnValue(mockRedis),
}));

// 모킹 후 임포트
const { LoginGuard } = await import('../../src/services/LoginGuard.js');

describe('LoginGuard', () => {
  let guard: InstanceType<typeof LoginGuard>;
  const testIp = '192.168.1.1';

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new LoginGuard();
  });

  describe('isBlocked', () => {
    it('차단되지 않은 IP는 false를 반환해야 한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await guard.isBlocked(testIp);

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith(`ward:login:blocked:${testIp}`);
    });

    it('차단된 IP는 true를 반환해야 한다', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await guard.isBlocked(testIp);

      expect(result).toBe(true);
    });
  });

  describe('recordFailure', () => {
    it('4회까지는 blocked: false를 반환해야 한다', async () => {
      // incr 호출 시 4 반환 (4번째 실패)
      mockRedis.incr.mockResolvedValue(4);
      mockRedis.expire.mockResolvedValue(1);

      const result = await guard.recordFailure(testIp);

      expect(result.blocked).toBe(false);
      expect(result.attemptsLeft).toBe(1); // 5 - 4 = 1
      expect(mockRedis.incr).toHaveBeenCalledWith(`ward:login:attempts:${testIp}`);
    });

    it('5회째에는 blocked: true를 반환하고 차단 키를 설정해야 한다', async () => {
      mockRedis.incr.mockResolvedValue(5);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue('OK');

      const result = await guard.recordFailure(testIp);

      expect(result.blocked).toBe(true);
      expect(result.attemptsLeft).toBe(0);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `ward:login:blocked:${testIp}`,
        '1',
        'EX',
        60 * 60,
      );
    });

    it('실패 횟수가 TTL을 갱신해야 한다 (첫 번째 실패 시)', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await guard.recordFailure(testIp);

      expect(mockRedis.expire).toHaveBeenCalledWith(
        `ward:login:attempts:${testIp}`,
        60 * 60,
      );
    });
  });

  describe('recordSuccess', () => {
    it('성공 시 실패 기록과 차단 키를 삭제해야 한다', async () => {
      mockRedis.del.mockResolvedValue(1);

      await guard.recordSuccess(testIp);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `ward:login:attempts:${testIp}`,
        `ward:login:blocked:${testIp}`,
      );
    });
  });

  describe('getBlockRemainingSeconds', () => {
    it('차단 후 남은 시간을 반환해야 한다', async () => {
      mockRedis.ttl.mockResolvedValue(3540);

      const seconds = await guard.getBlockRemainingSeconds(testIp);

      expect(seconds).toBe(3540);
      expect(mockRedis.ttl).toHaveBeenCalledWith(`ward:login:blocked:${testIp}`);
    });

    it('차단되지 않은 경우 0을 반환해야 한다', async () => {
      mockRedis.ttl.mockResolvedValue(-2); // 키 없음

      const seconds = await guard.getBlockRemainingSeconds(testIp);

      expect(seconds).toBe(0);
    });
  });

  describe('getAttempts', () => {
    it('현재 실패 횟수를 반환해야 한다', async () => {
      mockRedis.get.mockResolvedValue('3');

      const attempts = await guard.getAttempts(testIp);

      expect(attempts).toBe(3);
    });

    it('기록이 없으면 0을 반환해야 한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const attempts = await guard.getAttempts(testIp);

      expect(attempts).toBe(0);
    });
  });
});
