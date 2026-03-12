-- TimescaleDB hypertable 변환
-- metrics, processes, logs 테이블을 시계열 hypertable로 변환
-- 시간 범위 쿼리 성능 대폭 향상, 자동 청크 파티셔닝

--> statement-breakpoint

-- 메트릭: 7일 청크 (10초 간격 수집 → 하루 약 8,640건/서버)
SELECT create_hypertable(
  'metrics',
  'collected_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

--> statement-breakpoint

-- 프로세스: 7일 청크
SELECT create_hypertable(
  'processes',
  'collected_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

--> statement-breakpoint

-- 로그: 1일 청크 (로그는 건수가 많아 더 짧은 청크)
SELECT create_hypertable(
  'logs',
  'logged_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

--> statement-breakpoint

-- 인덱스: 서버별 시간 범위 조회 최적화
CREATE INDEX IF NOT EXISTS idx_metrics_server_time    ON metrics    (server_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_processes_server_time  ON processes  (server_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_server_time       ON logs       (server_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level             ON logs       (server_id, level, logged_at DESC);
