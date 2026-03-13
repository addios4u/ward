import Redis, { type RedisOptions } from 'ioredis';
import { config } from '../config/index.js';

// Redis 연결 옵션
function createRedisOptions(): RedisOptions {
  // REDIS_URL이 있으면 URL 방식 사용, 없으면 개별 설정 사용
  const options: RedisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    // 연결 실패 시 재시도 전략 (graceful degradation)
    retryStrategy(times: number) {
      if (times > 10) {
        // 10회 이상 재시도 실패 시 재시도 중단
        console.error('Redis 재연결 한도 초과, 재시도 중단');
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    // 명령 실패 시 재시도 안 함 (연결 중 명령 유실 방지)
    enableOfflineQueue: false,
    lazyConnect: true,
  };

  return options;
}

// 발행(pub)용 Redis 클라이언트 싱글턴
let pubClient: Redis | null = null;
// 구독(sub)용 Redis 클라이언트 싱글턴 (subscribe 모드에서는 다른 명령 불가)
let subClient: Redis | null = null;

/**
 * 발행용 Redis 클라이언트 반환
 * 서버가 죽지 않도록 연결 실패를 graceful하게 처리
 */
export function getPubClient(): Redis {
  if (!pubClient) {
    const url = config.redis.url;
    pubClient = url ? new Redis(url, createRedisOptions()) : new Redis(createRedisOptions());

    pubClient.on('connect', () => {
      console.log('Redis 발행 클라이언트 연결 성공');
    });

    pubClient.on('error', (err: Error) => {
      // 연결 오류 로그만 남기고 서버를 죽이지 않음
      console.error('Redis 발행 클라이언트 오류:', err.message);
    });

    pubClient.on('reconnecting', () => {
      console.log('Redis 발행 클라이언트 재연결 중...');
    });

    // 비동기 연결 시작 (에러 발생해도 서버 유지)
    pubClient.connect().catch((err: Error) => {
      console.error('Redis 발행 클라이언트 초기 연결 실패:', err.message);
    });
  }
  return pubClient;
}

/**
 * 구독용 Redis 클라이언트 반환
 * subscribe 모드에서는 일반 명령을 사용할 수 없으므로 별도 인스턴스 사용
 */
export function getSubClient(): Redis {
  if (!subClient) {
    const url = config.redis.url;
    subClient = url ? new Redis(url, createRedisOptions()) : new Redis(createRedisOptions());

    subClient.on('connect', () => {
      console.log('Redis 구독 클라이언트 연결 성공');
    });

    subClient.on('error', (err: Error) => {
      console.error('Redis 구독 클라이언트 오류:', err.message);
    });

    subClient.on('reconnecting', () => {
      console.log('Redis 구독 클라이언트 재연결 중...');
    });

    subClient.connect().catch((err: Error) => {
      console.error('Redis 구독 클라이언트 초기 연결 실패:', err.message);
    });
  }
  return subClient;
}

/**
 * Redis Pub/Sub 채널 상수
 */
export const REDIS_CHANNELS = {
  metrics: (serverId: string) => `ward:metrics:${serverId}`,
  logs: (serverId: string) => `ward:logs:${serverId}`,
  serverStatus: 'ward:server:status',
} as const;

/**
 * Redis 캐시 키 상수
 */
export const REDIS_KEYS = {
  latestMetrics: (serverId: string) => `ward:latest:metrics:${serverId}`,
  latestStatus: (serverId: string) => `ward:latest:status:${serverId}`,
} as const;

/**
 * Redis에 안전하게 발행 (연결 실패 시 오류 무시)
 */
export async function safePublish(channel: string, message: string): Promise<void> {
  try {
    const pub = getPubClient();
    await pub.publish(channel, message);
  } catch (err) {
    const error = err as Error;
    console.error(`Redis 발행 실패 (채널: ${channel}):`, error.message);
  }
}

/**
 * Redis에 안전하게 SET with TTL (연결 실패 시 오류 무시)
 */
export async function safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    const pub = getPubClient();
    await pub.set(key, value, 'EX', ttlSeconds);
  } catch (err) {
    const error = err as Error;
    console.error(`Redis SET 실패 (키: ${key}):`, error.message);
  }
}

/**
 * Redis에서 안전하게 GET (연결 실패 시 null 반환)
 */
export async function safeGet(key: string): Promise<string | null> {
  try {
    const pub = getPubClient();
    return await pub.get(key);
  } catch (err) {
    const error = err as Error;
    console.error(`Redis GET 실패 (키: ${key}):`, error.message);
    return null;
  }
}

/**
 * connect-redis v9용 ioredis 어댑터
 * connect-redis v9는 node-redis v4 스타일 API를 기대하므로 ioredis를 래핑
 */
export function getSessionStoreClient() {
  const client = getPubClient();
  return {
    get: (key: string) => client.get(key),
    set: (key: string, value: string, options?: { PX?: number; EX?: number }) => {
      if (options?.PX) return client.set(key, value, 'PX', options.PX);
      if (options?.EX) return client.set(key, value, 'EX', options.EX);
      return client.set(key, value);
    },
    expire: (key: string, ttl: number) => client.expire(key, ttl),
    expiretime: (key: string) => client.expiretime(key),
    del: (key: string | string[]) =>
      Array.isArray(key) ? client.del(...key) : client.del(key),
    mget: (...keys: string[]) => client.mget(...keys),
    scan: (cursor: string, options: { MATCH: string; COUNT: number }) =>
      client.scan(cursor, 'MATCH', options.MATCH, 'COUNT', options.COUNT)
        .then(([nextCursor, keys]) => ({ cursor: nextCursor, keys })),
  };
}

/**
 * Redis 연결 종료 (서버 종료 시 호출)
 */
export async function closeRedis(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (pubClient) {
    closePromises.push(
      pubClient.quit().then(() => {
        console.log('Redis 발행 클라이언트 연결 종료');
      }).catch(() => {
        pubClient?.disconnect();
      })
    );
    pubClient = null;
  }

  if (subClient) {
    closePromises.push(
      subClient.quit().then(() => {
        console.log('Redis 구독 클라이언트 연결 종료');
      }).catch(() => {
        subClient?.disconnect();
      })
    );
    subClient = null;
  }

  await Promise.all(closePromises);
}
