# Phase 5 — 운영 안정화 및 배포

## 목표
Docker 배포 구성, 안정성 강화, 운영 편의 기능 추가

## 전제 조건
- Phase 1~4 완료

## 작업 목록

### 5-1. Docker 구성
- [ ] `packages/server` Dockerfile 작성
- [ ] `packages/web` Dockerfile 작성
- [ ] `docker/docker-compose.yml` — server + web + db + redis 통합
- [ ] `docker/docker-compose.split.yml` — server/web 분리 배포용
- [ ] `.env` 기반 환경변수 주입 확인
- [ ] Docker 빌드 및 기동 테스트

### 5-2. 에이전트 안정성 강화
- [ ] 네트워크 단절 시 로컬 큐 버퍼링 고도화
  - 큐 최대 크기 설정
  - 재연결 시 순서대로 전송
- [ ] 전송 재시도 백오프 전략 (지수 백오프)
- [ ] 에이전트 크래시 후 자동 재시작 처리
- [ ] 테스트 케이스 작성

### 5-3. 데이터 보존 관리
- [ ] 메트릭 데이터 자동 정리 (보존 기간 초과 시 삭제)
- [ ] 로그 데이터 자동 정리
- [ ] 정리 주기 설정 (기본: 매일 새벽)
- [ ] 보존 기간 환경변수 설정 (`METRICS_RETENTION_DAYS`, `LOGS_RETENTION_DAYS`)

### 5-4. 보안 강화
- [ ] Rate limiting (에이전트 API, 로그인 API)
- [ ] API 키 재발급 기능
- [ ] CORS 설정 점검
- [ ] 환경변수 유효성 검사 (시작 시 필수 값 누락 체크)

### 5-5. 운영 편의
- [ ] server 기동 시 초기 관리자 계정 자동 생성 (최초 1회)
- [ ] `ward` 에이전트 설치 스크립트 (`install.sh`)
  - curl 한 줄로 설치 가능하도록
- [ ] 기본 README 작성 (설치, 실행 방법)

### 5-6. 통합 테스트
- [ ] agent → server → web 전체 흐름 E2E 테스트
- [ ] Docker 환경에서 통합 동작 확인

## 완료 기준
- `docker-compose up` 한 번으로 전체 서비스 기동
- 에이전트 설치 후 즉시 모니터링 시작
- 네트워크 단절/복구 시나리오 정상 동작
- 데이터 자동 정리 동작 확인
- 전체 E2E 테스트 통과
