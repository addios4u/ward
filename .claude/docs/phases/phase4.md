# Phase 4 — 웹 대시보드

## 목표
관리자가 서버 상태를 실시간으로 모니터링하는 Next.js 웹 대시보드 구현

## 전제 조건
- Phase 2 완료 (메트릭 데이터가 server에 쌓여 있어야 함)

## 작업 목록

### 4-1. packages/web 기본 세팅
- [ ] Next.js 14+ 프로젝트 생성 (App Router, TypeScript)
- [ ] Tailwind CSS 설정
- [ ] 환경변수 설정 (`NEXT_PUBLIC_SERVER_URL`, `INTERNAL_SERVER_URL`)
- [ ] API 클라이언트 모듈 (`src/lib/api.ts`)
- [ ] 테스트 환경 구성

### 4-2. 인증
- [ ] 로그인 페이지 (`/login`)
- [ ] JWT 기반 세션 관리 (NextAuth.js 또는 자체 구현)
- [ ] 미들웨어 — 미인증 시 로그인 페이지로 리다이렉트
- [ ] server에 `POST /api/auth/login` 엔드포인트 추가
- [ ] 테스트 케이스 작성

### 4-3. 서버 목록 화면
- [ ] 전체 서버 목록 페이지 (`/`)
- [ ] 서버 카드 컴포넌트 (`ServerCard.tsx`)
  - 서버명, 상태(온라인/오프라인), CPU/메모리 요약
- [ ] 서버 등록 모달 (API 키 발급 포함)
- [ ] 서버 삭제
- [ ] 테스트 케이스 작성

### 4-4. 서버 상세 화면
- [ ] 서버 상세 페이지 (`/servers/[id]`)
- [ ] 메트릭 차트 컴포넌트 (`MetricsChart.tsx`)
  - CPU, 메모리, 디스크, 네트워크 시계열 그래프
  - Recharts 사용
- [ ] 프로세스 목록 테이블
- [ ] 테스트 케이스 작성

### 4-5. 실시간 WebSocket 연동
- [ ] server에 WebSocket 서버 구현 (`src/websocket/WsManager.ts`)
  - 에이전트로부터 데이터 수신 시 연결된 웹 클라이언트에 브로드캐스트
- [ ] 웹에서 WebSocket 훅 (`src/hooks/useWebSocket.ts`)
- [ ] 서버 목록, 서버 상세 화면 실시간 업데이트 적용
- [ ] 테스트 케이스 작성

### 4-6. 로그 뷰어
- [ ] 로그 뷰어 페이지 (`/servers/[id]/logs`)
- [ ] 로그 스트림 컴포넌트 (`LogViewer.tsx`)
  - 실시간 로그 출력
  - 소스(nginx, app 등) 필터링
  - 레벨(info, warn, error) 필터링
- [ ] server에 `GET /api/servers/:id/logs` 엔드포인트 추가
- [ ] 테스트 케이스 작성

## 완료 기준
- 로그인 후 서버 목록 확인
- 서버 카드에 실시간 상태 반영
- 메트릭 차트에 이력 데이터 표시
- 로그 뷰어에서 실시간 로그 스트림 확인
- 모든 테스트 통과
