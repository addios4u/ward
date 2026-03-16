# 빠른 시작 (Quick Start)

Ward 서버 설치부터 첫 에이전트 연결까지의 단계별 가이드입니다.

---

## 사전 요건

- Docker 20.10 이상
- Docker Compose v2.0 이상
- Node.js v22 이상
- pnpm

---

## 1단계: 저장소 클론 및 환경변수 설정

```bash
git clone https://github.com/your-org/ward.git
cd ward
```

`.env.example` 파일을 복사해서 `.env` 파일을 만들고, 값을 실제 환경에 맞게 수정합니다.

```bash
cp samples/01-quick-start/.env.example .env
```

`.env` 파일을 열어 아래 항목을 반드시 변경합니다:

| 항목 | 설명 |
|------|------|
| `POSTGRES_PASSWORD` | PostgreSQL 비밀번호 (추측하기 어려운 값으로 설정) |
| `REDIS_PASSWORD` | Redis 비밀번호 |
| `SESSION_SECRET` | 세션 암호화 키 (32자 이상의 랜덤 문자열 권장) |

---

## 2단계: 의존성 설치

```bash
pnpm install
```

---

## 3단계: 인프라 실행

PostgreSQL, Redis, pgbouncer, nginx를 Docker Compose로 실행합니다.

```bash
pnpm docker:start
```

---

## 4단계: Ward 서버 빌드 및 시작

web/server/agent를 빌드하고 백그라운드로 Ward 서버를 실행합니다.

```bash
pnpm start
```

로그 확인:

```bash
# Ward 서버 로그
tail -f .ward/ward.log

# 인프라(PostgreSQL, Redis 등) 로그
pnpm docker:logs
```

Ward 서버 종료:

```bash
pnpm stop
```

---

## 5단계: 에이전트 설치

`@devskeo/ward-agent`는 npm에 출시되어 있지 않으므로, 소스에서 빌드해서 설치합니다.

모니터링할 **대상 서버**에서 아래 명령을 실행합니다.

```bash
git clone https://github.com/your-org/ward.git ward-agent
cd ward-agent
pnpm install
pnpm --filter @devskeo/ward-agent build
# 글로벌 링크
pnpm --filter @devskeo/ward-agent link --global
```

설치 확인:

```bash
ward --version
```

---

## 6단계: 에이전트 시작

에이전트를 Ward 서버에 연결합니다. `http://your-server:4000` 부분을 실제 서버 주소로 변경하세요.

```bash
ward start http://your-server:4000
```

서버에 그룹명을 지정하려면 `--name` 플래그를 사용합니다:

```bash
ward start http://your-server:4000 --name production
```

에이전트 상태 확인:

```bash
ward status
```

---

## 7단계: 대시보드 접속

웹 브라우저에서 `http://your-server` 에 접속합니다.

대시보드에서 방금 연결한 서버가 목록에 나타나면 설정이 완료된 것입니다.

---

## 문제 해결

### 에이전트가 서버에 연결되지 않는 경우

1. 서버 방화벽에서 4000 포트가 열려 있는지 확인합니다.
2. `ward status` 명령으로 에이전트 상태를 확인합니다.
3. Ward 서버 로그를 확인합니다: `tail -f .ward/ward.log`
4. 인프라 로그를 확인합니다: `pnpm docker:logs`

### Ward 서버를 재시작하려면

```bash
pnpm stop
pnpm start
```

### 에이전트를 중지하려면

```bash
ward stop
```
