# Phase 2 — 에이전트 메트릭 수집

## 목표
ward-agent CLI 기본 구조 및 시스템 메트릭 수집·전송 구현

## 전제 조건
- Phase 1 완료

## 작업 목록

### 2-1. packages/agent 기본 세팅
- [ ] `package.json` 생성
- [ ] `tsconfig.json` 생성
- [ ] CLI 프레임워크 설치 (commander.js)
- [ ] 기본 CLI 진입점 (`src/index.ts`)
- [ ] 테스트 환경 구성

### 2-2. 설정 관리
- [ ] 설정 파일 구조 정의 (`~/.ward/config.yaml`)
- [ ] `ward config init` — 서버 URL, API 키 입력 받아 저장
- [ ] `ward config show` — 현재 설정 출력
- [ ] 설정 로드/저장 모듈 (`src/config/AgentConfig.ts`)
- [ ] 테스트 케이스 작성

### 2-3. 시스템 메트릭 수집
- [ ] CPU 수집 (`src/metrics/CpuCollector.ts`)
  - 전체 사용률, load average
- [ ] 메모리 수집 (`src/metrics/MemoryCollector.ts`)
  - 전체/사용/여유, 스왑
- [ ] 디스크 수집 (`src/metrics/DiskCollector.ts`)
  - 마운트별 사용량, I/O
- [ ] 네트워크 수집 (`src/metrics/NetworkCollector.ts`)
  - 인터페이스별 송수신량
- [ ] 프로세스 수집 (`src/metrics/ProcessCollector.ts`)
  - 실행 중인 프로세스 목록, PID, CPU/메모리
- [ ] 각 수집기 테스트 케이스 작성

### 2-4. 메트릭 서버 전송
- [ ] HTTP 클라이언트 모듈 (`src/transport/HttpClient.ts`)
- [ ] 전송 실패 시 로컬 큐잉 (`src/transport/Queue.ts`)
- [ ] 10초 간격 배치 전송 로직
- [ ] 테스트 케이스 작성

### 2-5. Heartbeat
- [ ] 30초 간격 heartbeat 전송
- [ ] server에 `POST /api/agent/heartbeat` 엔드포인트 추가
- [ ] 서버에서 last_seen_at 업데이트 + status 관리

### 2-6. CLI 명령어
- [ ] `ward start` — 에이전트 백그라운드 데몬 시작
- [ ] `ward stop` — 에이전트 중지
- [ ] `ward status` — 에이전트 상태 확인

## 완료 기준
- `ward config init` 으로 설정 완료
- `ward start` 실행 시 메트릭이 서버에 정상 전송
- server DB에 metrics 데이터 저장 확인
- 모든 수집기 테스트 통과
