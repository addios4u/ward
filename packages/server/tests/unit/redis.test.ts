import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ioredis 모킹
const mockRedisInstance = {
  on: vi.fn().mockReturnThis(),
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue('OK'),
  publish: vi.fn().mockResolvedValue(1),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
};

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => mockRedisInstance),
  };
});

vi.mock('../../src/config/index.js', () => ({
  config: {
    redis: {
      url: '',
      host: 'localhost',
      port: 6379,
      password: undefined,
    },
  },
}));

describe('Redis 유틸리티', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 모듈 캐시 초기화 (싱글턴 리셋)
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('REDIS_CHANNELS', () => {
    it('metrics 채널명이 올바른 형식이어야 한다', async () => {
      const { REDIS_CHANNELS } = await import('../../src/lib/redis.js');
      expect(REDIS_CHANNELS.metrics('server-1')).toBe('ward:metrics:server-1');
    });

    it('logs 채널명이 올바른 형식이어야 한다', async () => {
      const { REDIS_CHANNELS } = await import('../../src/lib/redis.js');
      expect(REDIS_CHANNELS.logs('server-1')).toBe('ward:logs:server-1');
    });

    it('serverStatus 채널명이 올바른 형식이어야 한다', async () => {
      const { REDIS_CHANNELS } = await import('../../src/lib/redis.js');
      expect(REDIS_CHANNELS.serverStatus).toBe('ward:server:status');
    });
  });

  describe('REDIS_KEYS', () => {
    it('latestMetrics 키가 올바른 형식이어야 한다', async () => {
      const { REDIS_KEYS } = await import('../../src/lib/redis.js');
      expect(REDIS_KEYS.latestMetrics('server-1')).toBe('ward:latest:metrics:server-1');
    });

    it('latestStatus 키가 올바른 형식이어야 한다', async () => {
      const { REDIS_KEYS } = await import('../../src/lib/redis.js');
      expect(REDIS_KEYS.latestStatus('server-1')).toBe('ward:latest:status:server-1');
    });
  });

  describe('safePublish', () => {
    it('Redis에 메시지를 발행해야 한다', async () => {
      mockRedisInstance.publish.mockResolvedValueOnce(1);
      const { safePublish } = await import('../../src/lib/redis.js');
      await safePublish('ward:metrics:server-1', '{"cpu": 50}');
      expect(mockRedisInstance.publish).toHaveBeenCalledWith('ward:metrics:server-1', '{"cpu": 50}');
    });

    it('Redis 오류 발생 시 예외를 던지지 않아야 한다', async () => {
      mockRedisInstance.publish.mockRejectedValueOnce(new Error('Redis 연결 실패'));
      const { safePublish } = await import('../../src/lib/redis.js');
      // 예외 없이 완료되어야 함
      await expect(safePublish('test-channel', 'message')).resolves.toBeUndefined();
    });
  });

  describe('safeSet', () => {
    it('Redis에 키-값을 TTL과 함께 저장해야 한다', async () => {
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      const { safeSet } = await import('../../src/lib/redis.js');
      await safeSet('ward:latest:metrics:server-1', '{"cpu": 50}', 60);
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'ward:latest:metrics:server-1',
        '{"cpu": 50}',
        'EX',
        60
      );
    });

    it('Redis 오류 발생 시 예외를 던지지 않아야 한다', async () => {
      mockRedisInstance.set.mockRejectedValueOnce(new Error('Redis 연결 실패'));
      const { safeSet } = await import('../../src/lib/redis.js');
      await expect(safeSet('test-key', 'value', 60)).resolves.toBeUndefined();
    });
  });

  describe('safeGet', () => {
    it('Redis에서 값을 읽어야 한다', async () => {
      mockRedisInstance.get.mockResolvedValueOnce('{"cpu": 50}');
      const { safeGet } = await import('../../src/lib/redis.js');
      const result = await safeGet('ward:latest:metrics:server-1');
      expect(result).toBe('{"cpu": 50}');
    });

    it('키가 없으면 null을 반환해야 한다', async () => {
      mockRedisInstance.get.mockResolvedValueOnce(null);
      const { safeGet } = await import('../../src/lib/redis.js');
      const result = await safeGet('nonexistent-key');
      expect(result).toBeNull();
    });

    it('Redis 오류 발생 시 null을 반환해야 한다', async () => {
      mockRedisInstance.get.mockRejectedValueOnce(new Error('Redis 연결 실패'));
      const { safeGet } = await import('../../src/lib/redis.js');
      const result = await safeGet('test-key');
      expect(result).toBeNull();
    });
  });
});
