import dotenv from 'dotenv';
import path from 'path';

// 루트 .env 파일 로드 (dist/config/ 기준 4단계 상위 = ward 루트)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT ?? '4000', 10),
    host: process.env.SERVER_HOST ?? '0.0.0.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
  db: {
    get url() {
      if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('${')) {
        return process.env.DATABASE_URL;
      }
      const host = process.env.POSTGRES_HOST ?? 'localhost';
      const port = process.env.POSTGRES_PORT ?? '5432';
      const db = process.env.POSTGRES_DB ?? 'ward';
      const user = process.env.POSTGRES_USER ?? 'ward';
      const password = process.env.POSTGRES_PASSWORD ?? '';
      return `postgresql://${user}:${password}@${host}:${port}/${db}`;
    },
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    database: process.env.POSTGRES_DB ?? 'ward',
    user: process.env.POSTGRES_USER ?? 'ward',
    password: process.env.POSTGRES_PASSWORD ?? '',
  },
  session: {
    secret: process.env.SESSION_SECRET ?? '',
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
