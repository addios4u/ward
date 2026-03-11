# Phase 3 — 로그 포워딩

## 목표
앱 로그(Nginx, Apache, PHP, Node.js 등) 실시간 수집 및 서버 전송

## 전제 조건
- Phase 2 완료

## 작업 목록

### 3-1. 로그 파일 감시
- [ ] 로그 파일 tail 감시 모듈 (`src/logs/LogWatcher.ts`)
  - `fs.watch` 또는 chokidar 기반
  - 파일 rotate 감지 및 재연결 처리
- [ ] 여러 로그 파일 동시 감시 지원
- [ ] 테스트 케이스 작성

### 3-2. 로그 포워딩
- [ ] 로그 전송 모듈 (`src/logs/LogForwarder.ts`)
  - 소규모 배치 HTTP POST (100줄 또는 1초마다)
  - 전송 실패 시 큐잉 후 재시도
- [ ] 로그 파싱 (nginx, apache, 일반 텍스트 포맷)
- [ ] 테스트 케이스 작성

### 3-3. server 로그 수신 API
- [ ] `POST /api/agent/logs` 엔드포인트 구현
- [ ] logs 테이블 저장
- [ ] 소스별(nginx, app 등) 분류 저장
- [ ] 테스트 케이스 작성

### 3-4. 설정 연동
- [ ] `~/.ward/config.yaml`에 로그 경로 설정 항목 추가
  ```yaml
  logs:
    - path: "/var/log/nginx/access.log"
      type: nginx
    - path: "/var/log/app/error.log"
      type: app
  ```
- [ ] `ward config init` 에서 로그 경로 설정 흐름 추가

## 완료 기준
- 설정된 로그 파일 변경 시 server에 실시간 전송
- server DB logs 테이블에 저장 확인
- 파일 rotate 상황에서도 정상 동작
- 모든 테스트 통과
