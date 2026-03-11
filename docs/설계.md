# Ward 시스템 설계 문서

## 1. 전체 아키텍처

```
[모니터링 대상 서버]                    [운영 서버]
┌─────────────────┐                 ┌──────────────────────┐
│   ward-agent    │  HTTP/WebSocket │   ward-server        │
│  ┌───────────┐  │ ──────────────► │   (Express API)      │
│  │ 메트릭 수집 │  │                 │                      │
│  └───────────┘  │                 │   PostgreSQL         │
│  ┌───────────┐  │                 │   (데이터 저장)        │
│  │ 로그 포워딩 │  │                 └──────────┬───────────┘
│  └───────────┘  │                            │ WebSocket
└─────────────────┘                 ┌──────────▼───────────┐
                                    │   ward-web           │
[모니터링 대상 서버 N]               │   (Next.js 대시보드)  │
┌─────────────────┐                 └──────────────────────┘
│   ward-agent    │ ──────────────►
└─────────────────┘                 [관리자 브라우저]
                                    └─ 실시간 모니터링 화면
```

---

## 2. 모노레포 구조

```
ward/
├── packages/
│   ├── server/             # 중앙 백엔드 서버
│   ├── agent/              # 서버 에이전트
│   └── web/                # 관리자 대시보드
├── docs/                   # 설계 문서
├── docker/
│   ├── docker-compose.yml          # 기본 (server + web 통합)
│   ├── docker-compose.split.yml    # 분리 배포용
│   └── Dockerfile.*
├── .nvmrc
├── .gitignore
├── CLAUDE.md
└── package.json            # 워크스페이스 루트
```

### 패키지 매니저
- **pnpm workspaces** 사용 (속도, 디스크 효율)

---

## 3. packages/server 상세 설계

### 역할
에이전트로부터 데이터를 수신·저장하고, 웹 대시보드에 실시간으로 제공

### 기술 스택
- Node.js v22 + Express + TypeScript
- PostgreSQL (데이터 저장)
- WebSocket (ws 라이브러리, 웹 대시보드 실시간 전송)
- JWT (인증)

### 디렉토리 구조
```
packages/server/
├── src/
│   ├── app.ts              # Express 앱 설정
│   ├── index.ts            # 진입점
│   ├── config/             # 환경변수, 설정
│   ├── routes/             # API 라우터
│   │   ├── agent.ts        # 에이전트 데이터 수신
│   │   ├── servers.ts      # 서버 관리
│   │   ├── metrics.ts      # 메트릭 조회
│   │   ├── logs.ts         # 로그 조회
│   │   └── auth.ts         # 인증
│   ├── services/           # 비즈니스 로직
│   │   ├── MetricsService.ts
│   │   ├── LogService.ts
│   │   ├── ServerService.ts
│   │   └── AlertService.ts
│   ├── websocket/          # WebSocket 관리
│   │   └── WsManager.ts
│   ├── db/                 # 데이터베이스
│   │   ├── index.ts        # DB 연결
│   │   ├── migrations/     # 스키마 마이그레이션
│   │   └── repositories/   # 데이터 접근 레이어
│   ├── middleware/         # 미들웨어
│   │   ├── auth.ts         # JWT 검증
│   │   └── agentAuth.ts    # API 키 검증
│   └── types/              # 타입 정의
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
└── tsconfig.json
```

### API 엔드포인트

#### 에이전트 → 서버 (API Key 인증)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/agent/metrics` | 시스템 메트릭 수신 |
| POST | `/api/agent/logs` | 로그 배치 수신 |
| POST | `/api/agent/heartbeat` | 에이전트 생존 신호 |
| GET  | `/api/agent/config` | 에이전트 설정 조회 |

#### 웹 대시보드 → 서버 (JWT 인증)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 관리자 로그인 |
| GET  | `/api/servers` | 서버 목록 조회 |
| POST | `/api/servers` | 서버 등록 (API 키 발급) |
| DELETE | `/api/servers/:id` | 서버 삭제 |
| GET  | `/api/servers/:id/metrics` | 메트릭 이력 조회 |
| GET  | `/api/servers/:id/logs` | 로그 조회 |
| GET  | `/api/servers/:id/status` | 현재 상태 조회 |

#### WebSocket
- `ws://host/ws` — 웹 대시보드 실시간 데이터 수신

---

## 4. packages/agent 상세 설계

### 역할
모니터링 대상 서버에 설치되어 시스템 메트릭 수집 + 로그 포워딩

### 기술 스택
- Node.js v22 + TypeScript
- 성능이 필요한 경우 Rust로 대체 검토 (메트릭 수집 코어)

### 디렉토리 구조
```
packages/agent/
├── src/
│   ├── index.ts            # CLI 진입점
│   ├── cli/                # CLI 명령어
│   │   ├── start.ts        # 에이전트 시작
│   │   ├── stop.ts         # 에이전트 중지
│   │   ├── status.ts       # 에이전트 상태
│   │   └── config.ts       # 설정 관리
│   ├── metrics/            # 메트릭 수집
│   │   ├── CpuCollector.ts
│   │   ├── MemoryCollector.ts
│   │   ├── DiskCollector.ts
│   │   ├── NetworkCollector.ts
│   │   └── ProcessCollector.ts
│   ├── logs/               # 로그 포워딩
│   │   ├── LogWatcher.ts   # 파일 감시 (tail -f 방식)
│   │   └── LogForwarder.ts # 서버로 전송
│   ├── transport/          # 서버 통신
│   │   ├── HttpClient.ts   # HTTP 전송
│   │   └── Queue.ts        # 전송 실패 시 큐잉
│   └── config/             # 설정
│       └── AgentConfig.ts
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
└── tsconfig.json
```

### CLI 명령어
```bash
ward start          # 에이전트 시작 (백그라운드 데몬)
ward stop           # 에이전트 중지
ward status         # 에이전트 상태 확인
ward logs           # 에이전트 자체 로그 확인
ward config init    # 설정 초기화 (서버 URL, API 키 입력)
ward config show    # 현재 설정 확인
```

### 설정 파일 (`~/.ward/config.yaml`)
```yaml
server:
  url: "http://monitoring-server:3000"
  apiKey: "agent-api-key-here"

metrics:
  interval: 10          # 수집 주기 (초)

logs:
  - path: "/var/log/nginx/access.log"
    type: nginx
  - path: "/var/log/app/error.log"
    type: app
```

### 수집 메트릭
- **CPU**: 사용률, 코어별 사용률, load average
- **메모리**: 전체/사용/여유, 스왑
- **디스크**: 마운트별 사용량, I/O
- **네트워크**: 인터페이스별 송수신량
- **프로세스**: 실행 중인 프로세스 목록, PID, CPU/메모리 사용률

### 전송 방식
- 메트릭: 10초 간격 HTTP POST 배치 전송
- 로그: 실시간 WebSocket 또는 소규모 배치 HTTP POST
- 네트워크 단절 시: 로컬 큐에 버퍼링 후 재연결 시 전송
- Heartbeat: 30초마다 생존 신호 전송

---

## 5. packages/web 상세 설계

### 역할
관리자가 모든 서버의 상태를 실시간으로 모니터링하는 대시보드

### 기술 스택
- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS (스타일링)
- Recharts 또는 Chart.js (메트릭 그래프)
- WebSocket (실시간 데이터 수신)

### 디렉토리 구조
```
packages/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/          # 로그인 페이지
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx        # 전체 서버 목록
│   │   │   ├── servers/
│   │   │   │   └── [id]/       # 서버 상세
│   │   │   │       ├── page.tsx
│   │   │   │       ├── metrics/ # 메트릭 상세
│   │   │   │       └── logs/    # 로그 뷰어
│   │   │   └── settings/       # 설정
│   │   └── api/                # Next.js API Routes (서버 프록시)
│   ├── components/
│   │   ├── dashboard/          # 대시보드 컴포넌트
│   │   │   ├── ServerCard.tsx  # 서버 카드
│   │   │   ├── MetricsChart.tsx
│   │   │   └── LogViewer.tsx
│   │   └── ui/                 # 공통 UI 컴포넌트
│   ├── hooks/
│   │   ├── useWebSocket.ts     # WebSocket 연결 훅
│   │   └── useMetrics.ts       # 메트릭 데이터 훅
│   ├── lib/
│   │   ├── api.ts              # API 클라이언트
│   │   └── websocket.ts        # WebSocket 클라이언트
│   └── types/                  # 타입 정의
├── tests/
├── package.json
└── tsconfig.json
```

### 주요 화면
1. **전체 서버 목록** — 서버별 상태 카드 (온라인/오프라인, CPU/메모리 요약)
2. **서버 상세** — 실시간 메트릭 그래프, 프로세스 목록
3. **로그 뷰어** — 실시간 로그 스트림, 필터링
4. **서버 등록** — 새 서버 추가 + API 키 발급
5. **설정** — 관리자 계정, 알림 설정

---

## 6. 데이터 모델 (PostgreSQL)

### servers
```sql
- id            UUID PK
- name          VARCHAR       -- 서버 별명
- hostname      VARCHAR       -- 실제 호스트명
- api_key       VARCHAR UNIQUE -- 에이전트 인증 키
- status        ENUM(online, offline, unknown)
- last_seen_at  TIMESTAMP
- created_at    TIMESTAMP
```

### metrics
```sql
- id            BIGSERIAL PK
- server_id     UUID FK
- collected_at  TIMESTAMP
- cpu_usage     FLOAT         -- %
- mem_total     BIGINT        -- bytes
- mem_used      BIGINT        -- bytes
- disk_usage    JSONB         -- 마운트별
- network_io    JSONB         -- 인터페이스별
- load_avg      FLOAT[]       -- [1m, 5m, 15m]
```

### processes
```sql
- id            BIGSERIAL PK
- server_id     UUID FK
- collected_at  TIMESTAMP
- pid           INT
- name          VARCHAR
- cpu_usage     FLOAT
- mem_usage     BIGINT
```

### logs
```sql
- id            BIGSERIAL PK
- server_id     UUID FK
- source        VARCHAR       -- nginx, app, php 등
- level         VARCHAR       -- info, warn, error
- message       TEXT
- logged_at     TIMESTAMP
- created_at    TIMESTAMP
```

### users
```sql
- id            UUID PK
- email         VARCHAR UNIQUE
- password_hash VARCHAR
- created_at    TIMESTAMP
```

---

## 7. 인증 구조

### 에이전트 인증
- 서버 등록 시 UUID 기반 API 키 자동 발급
- 에이전트 요청마다 `Authorization: Bearer <api-key>` 헤더
- 서버는 DB에서 API 키 조회 후 서버 식별

### 관리자 인증
- 이메일/비밀번호 로그인
- JWT 발급 (Access Token: 1시간, Refresh Token: 7일)
- 웹 대시보드 모든 API 요청에 JWT 포함

---

## 8. Docker 배포 구조

### 기본 배포 (server + web 통합)
```yaml
# docker/docker-compose.yml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

  server:
    build: ./packages/server
    depends_on: [db]
    environment:
      - DATABASE_URL=...
      - JWT_SECRET=...

  web:
    build: ./packages/web
    depends_on: [server]
    ports:
      - "3000:3000"
    environment:
      - SERVER_URL=http://server:4000

volumes:
  pgdata:
```

### 분리 배포 (server, web 별도 서버)
- `docker-compose.server.yml` — server + db
- `docker-compose.web.yml` — web만

---

## 9. 개발 순서 (로드맵)

### Phase 1 — 기반 구축
1. 모노레포 초기 세팅 (pnpm workspaces, tsconfig 공유)
2. `packages/server` 기본 Express 앱 + DB 연결 + 마이그레이션
3. 에이전트 API 키 등록 API

### Phase 2 — 에이전트
4. `packages/agent` CLI 기본 틀 + config 관리
5. 시스템 메트릭 수집 (CPU, 메모리, 디스크, 네트워크)
6. 메트릭 서버 전송 + Heartbeat

### Phase 3 — 로그 포워딩
7. 로그 파일 감시 (LogWatcher)
8. 로그 서버 전송

### Phase 4 — 웹 대시보드
9. `packages/web` Next.js 기본 세팅 + 로그인
10. 서버 목록 화면
11. 서버 상세 + 메트릭 차트
12. 실시간 WebSocket 연동
13. 로그 뷰어

### Phase 5 — 운영 안정화
14. Docker Compose 설정
15. 에이전트 네트워크 단절 시 큐잉/재전송
16. 데이터 보존 기간 설정 + 자동 정리
