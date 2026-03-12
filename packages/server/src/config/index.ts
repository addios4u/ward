import dotenv from 'dotenv';
import path from 'path';

// 루트 .env 파일 로드
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT ?? '4000', 10),
    host: process.env.SERVER_HOST ?? '0.0.0.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
  db: {
    url: process.env.DATABASE_URL ?? '',
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    database: process.env.POSTGRES_DB ?? 'ward',
    user: process.env.POSTGRES_USER ?? 'ward',
    password: process.env.POSTGRES_PASSWORD ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  retention: {
    metricsDays: parseInt(process.env.METRICS_RETENTION_DAYS ?? '30', 10),
    logsDays: parseInt(process.env.LOGS_RETENTION_DAYS ?? '7', 10),
  },
  redis: {
    url: process.env.REDIS_URL ?? '',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
  },
} as const;
