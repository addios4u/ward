-- Ward PostgreSQL 초기 익스텐션 설정
-- Docker 첫 기동 시 자동 실행됨

-- TimescaleDB: 시계열 데이터 최적화
-- metrics, processes, logs 테이블을 hypertable로 변환하면
-- 시간 범위 쿼리 성능이 크게 향상됨
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- pgvector: 벡터 유사도 검색
-- 로그 의미 검색, 이상 탐지 등에 활용 가능
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_stat_statements: 쿼리 성능 모니터링 (선택적)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
