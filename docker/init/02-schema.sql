-- Ward 데이터베이스 스키마
-- Docker 첫 기동 시 자동 실행 (최초 1회)

-- server_status ENUM
CREATE TYPE server_status AS ENUM ('online', 'offline', 'unknown');

-- 서버 목록
CREATE TABLE servers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  hostname     VARCHAR(255) NOT NULL,
  group_name   VARCHAR(255),
  public_ip    VARCHAR(45),
  country      VARCHAR(100),
  city         VARCHAR(100),
  isp          VARCHAR(255),
  status       server_status NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 관리자 계정
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 시스템 메트릭 (TimescaleDB hypertable)
-- TimescaleDB: 시간 컬럼이 복합 기본키에 포함되어야 함
CREATE TABLE metrics (
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

-- 프로세스 스냅샷 (TimescaleDB hypertable)
CREATE TABLE processes (
  id           BIGSERIAL,
  server_id    UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  collected_at TIMESTAMP NOT NULL,
  pid          INTEGER NOT NULL,
  name         VARCHAR(255) NOT NULL,
  cpu_usage    DOUBLE PRECISION,
  mem_usage    BIGINT,
  PRIMARY KEY (id, collected_at)
);

-- 로그 (TimescaleDB hypertable)
CREATE TABLE logs (
  id         BIGSERIAL,
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  source     VARCHAR(100),
  level      VARCHAR(20),
  message    TEXT NOT NULL,
  logged_at  TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, logged_at)
);

-- hypertable 변환
-- metrics: 7일 청크 (10초 간격 수집, 서버당 하루 ~8,640건)
SELECT create_hypertable('metrics',   'collected_at', chunk_time_interval => INTERVAL '7 days');
-- processes: 7일 청크
SELECT create_hypertable('processes', 'collected_at', chunk_time_interval => INTERVAL '7 days');
-- logs: 1일 청크 (건수가 많아 짧은 청크)
SELECT create_hypertable('logs',      'logged_at',    chunk_time_interval => INTERVAL '1 day');

-- 인덱스: 서버별 시간 범위 조회 최적화
CREATE INDEX idx_metrics_server_time   ON metrics   (server_id, collected_at DESC);
CREATE INDEX idx_processes_server_time ON processes (server_id, collected_at DESC);
CREATE INDEX idx_logs_server_time      ON logs      (server_id, logged_at DESC);
CREATE INDEX idx_logs_level            ON logs      (server_id, level, logged_at DESC);
