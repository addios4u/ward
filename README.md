# Ward

Self-hosted 서버 모니터링 시스템. 중소규모 팀이 자체 인프라에 직접 설치해서 운영하는 방식의 서버 모니터링 도구입니다.

<a href="https://www.buymeacoffee.com/addios4u" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="36"></a>

![서버 목록](https://raw.githubusercontent.com/addios4u/ward/main/screenshots/01.png)

## 주요 기능

- **실시간 시스템 메트릭** - CPU, 메모리, 디스크, 네트워크 사용률을 실시간으로 수집하고 시각화
- **로그 포워딩** - 애플리케이션 로그를 실시간으로 수집하여 웹 대시보드에서 확인
- **서비스 모니터링** - 프로세스 단위의 상태, PID, CPU, 메모리 사용량 추적
- **다중 서버 관리** - 여러 서버의 상태를 하나의 대시보드에서 통합 모니터링
- **간편한 설치** - Docker로 DB 구성 후 `pnpm start`로 바로 시작

## 스크린샷

| 서버 상세 | 서비스 목록 |
|:-:|:-:|
| ![서버 상세](https://raw.githubusercontent.com/addios4u/ward/main/screenshots/02.png) | ![서비스 목록](https://raw.githubusercontent.com/addios4u/ward/main/screenshots/03.png) |

| 서비스 상세 |
|:-:|
| ![서비스 상세](https://raw.githubusercontent.com/addios4u/ward/main/screenshots/04.png) |

## 아키텍처

```
ward/
├── packages/
│   ├── server/     # 중앙 백엔드 서버 (Express + TypeScript)
│   ├── agent/      # 모니터링 에이전트 (Node.js CLI)
│   └── web/        # 관리자 대시보드 (React + Vite)
└── docker/         # Docker Compose 구성
```

```
[에이전트] ──메트릭/로그──▶ [서버] ◀──WebSocket──▶ [웹 대시보드]
 (각 서버)                  (중앙)                  (브라우저)
                             │
                     ┌───────┴───────┐
                     ▼               ▼
                 PostgreSQL        Redis
```

- **Server** - 에이전트로부터 메트릭과 로그를 수신하여 PostgreSQL에 저장하고, WebSocket으로 대시보드에 실시간 전달
- **Agent** - 모니터링 대상 서버에 설치하여 시스템 메트릭을 수집하고 애플리케이션 로그를 포워딩
- **Web** - 서버 상태를 실시간으로 확인하는 관리자 대시보드

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/addios4u/ward.git
cd ward

cp .env.sample .env
# .env 파일에서 비밀번호와 설정을 변경하세요

pnpm install
```

### 2. 인프라 시작 (PostgreSQL, Redis, PgBouncer)

```bash
pnpm docker:start
```

### 3. 서비스 시작

```bash
# 빌드 + 서버/웹/에이전트 한 번에 시작
pnpm start

# 중지
pnpm stop
```

### 4. 에이전트 설치 (모니터링 대상 서버)

```bash
npm install -g @devskeo/ward-agent

# 에이전트 설정
ward config set --server-url http://your-ward-server:4000

# 에이전트 시작
ward start
```

에이전트를 시작하면 서버 목록에 자동으로 나타납니다.

### 5. 대시보드 접속

브라우저에서 `http://your-ward-server` 로 접속합니다.

## 로그 수집 방식

Ward 에이전트는 5가지 방식으로 로그를 수집합니다.

| 방식 | 설명 | 예시 |
|------|------|------|
| `exec` | 명령어 실행 후 stdout 수집 | Node.js, Python 앱 |
| `file` | 로그 파일 tail | Nginx, Apache 로그 |
| `journal` | systemd journalctl | systemd 서비스 |
| `docker` | Docker 컨테이너 로그 | Docker 앱 |
| `pipe` | 쉘 파이프 명령어 | 커스텀 로그 스트림 |

## 기술 스택

| 패키지 | 기술 |
|--------|------|
| Server | Node.js v22, Express, TypeScript, PostgreSQL, Redis |
| Agent | Node.js v22, TypeScript, Commander.js |
| Web | React 18, Vite, TypeScript, Tailwind CSS, Recharts |
| 인프라 | Docker, Docker Compose, Nginx |

## 샘플

[samples/](samples/) 디렉토리에 10가지 실제 사용 사례가 준비되어 있습니다.

| # | 샘플 | 설명 |
|---|------|------|
| 01 | [빠른 시작](samples/01-quick-start/) | 에이전트 설치 및 기본 실행 |
| 02 | [단일 서버](samples/02-single-server/) | 단일 서버 모니터링 기본 설정 |
| 03 | [다중 서버](samples/03-multi-server-groups/) | 서버 그룹 관리 |
| 04 | [Node.js 서비스](samples/04-nodejs-service/) | Node.js 앱 로그 수집 |
| 05 | [Docker 모니터링](samples/05-docker-monitoring/) | Docker 컨테이너 로그 수집 |
| 06 | [웹서버 로그](samples/06-webserver-logs/) | Nginx/Apache 로그 수집 |
| 07 | [systemd 모니터링](samples/07-systemd-monitoring/) | systemd 저널 로그 수집 |
| 08 | [파이프 로깅](samples/08-pipe-logging/) | 파이프를 통한 실시간 스트리밍 |
| 09 | [다중 관리자](samples/09-multi-admin/) | 팀 환경 다중 관리자 계정 |
| 10 | [API 연동](samples/10-api-integration/) | REST API를 통한 외부 연동 |

## 개발

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행 (web + agent)
pnpm dev

# 빌드
pnpm build

# 테스트
pnpm test

# 린트
pnpm lint
```

## 라이선스

[MIT](LICENSE)
