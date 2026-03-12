-- Ward 초기 스키마 마이그레이션

-- 익스텐션 (Docker init 스크립트와 중복되지만 standalone 환경을 위해 포함)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint

-- server_status ENUM
DO $$ BEGIN
  CREATE TYPE server_status AS ENUM ('online', 'offline', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

--> statement-breakpoint

-- 서버 목록
CREATE TABLE IF NOT EXISTS servers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  hostname    VARCHAR(255) NOT NULL,
  api_key     VARCHAR(255) NOT NULL UNIQUE,
  status      server_status NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

--> statement-breakpoint

-- 관리자 계정
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

--> statement-breakpoint

-- 시스템 메트릭 (시계열 → 0001에서 hypertable 변환)
CREATE TABLE IF NOT EXISTS metrics (
  id           BIGSERIAL,
  server_id    UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  collected_at TIMESTAMP NOT NULL,
  cpu_usage    DOUBLE PRECISION,
  mem_total    BIGINT,
  mem_used     BIGINT,
  disk_usage   JSONB,
  network_io   JSONB,
  load_avg     DOUBLE PRECISION[],
  PRIMARY KEY (id, collected_at)
);

--> statement-breakpoint

-- 프로세스 스냅샷 (시계열 → 0001에서 hypertable 변환)
CREATE TABLE IF NOT EXISTS processes (
  id           BIGSERIAL,
  server_id    UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  collected_at TIMESTAMP NOT NULL,
  pid          INTEGER NOT NULL,
  name         VARCHAR(255) NOT NULL,
  cpu_usage    DOUBLE PRECISION,
  mem_usage    BIGINT,
  PRIMARY KEY (id, collected_at)
);

--> statement-breakpoint

-- 로그 (시계열 → 0001에서 hypertable 변환)
CREATE TABLE IF NOT EXISTS logs (
  id         BIGSERIAL,
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  source     VARCHAR(100),
  level      VARCHAR(20),
  message    TEXT NOT NULL,
  logged_at  TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, logged_at)
);
