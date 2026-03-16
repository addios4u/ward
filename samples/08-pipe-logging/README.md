# 샘플 08: Pipe 방식 실시간 로그 전송

이 샘플은 `pipe` 방식으로 기존 애플리케이션의 stdout 출력 또는 임의의 쉘 명령 결과를 Ward에 실시간으로 연결하는 방법을 안내합니다.

---

## pipe 방식이란?

`pipe` 방식은 쉘 파이프(`|`)를 포함한 임의의 명령어를 실행하고, 그 stdout 출력을 Ward로 스트리밍합니다.

- `file` 방식으로는 수집하기 어려운 동적 스트림 데이터에 적합
- `grep`, `awk`, `sed` 등 필터링 도구와 조합 가능
- 로그 파일이 없는 명령 출력(예: 커스텀 스크립트, syslog 필터)도 수집 가능

```json
{
  "name": "syslog-errors",
  "method": "pipe",
  "command": "tail -f /var/log/syslog | grep -i error"
}
```

---

## ward pipe CLI 명령 사용법

`ward pipe` 명령을 사용하면 stdin으로 들어오는 데이터를 Ward 서버로 직접 전송할 수 있습니다.

### 기본 사용법

```bash
# 앱 실행 결과를 Ward로 전송
node app.js | ward pipe --server http://ward-server:4000 --name my-app

# 파일 tail을 Ward로 전송
tail -f /var/log/app.log | ward pipe --server http://ward-server:4000 --name app-log
```

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--server` | Ward 서버 URL | config.json의 server.url |
| `--name` | 서비스 이름 | 필수 |
| `--group` | 서버 그룹 이름 | config.json의 server.groupName |

### 사용 예시

```bash
# 에러 레벨 로그만 필터링해서 전송
journalctl -f | grep ERROR | ward pipe --name filtered-errors

# Python 스크립트 출력 전송
python3 monitor.py | ward pipe --name py-monitor

# 여러 로그 파일을 합쳐서 전송
tail -f /app/logs/app1.log /app/logs/app2.log | ward pipe --name combined-logs
```

---

## 사용 사례

### 1. syslog 에러 필터링

시스템 로그에서 에러 메시지만 골라서 모니터링합니다.

```json
{
  "name": "syslog-errors",
  "method": "pipe",
  "command": "tail -f /var/log/syslog | grep -i error"
}
```

### 2. 인증 로그 모니터링

CRON 작업 로그를 제외한 인증 이벤트를 수집합니다.

```json
{
  "name": "auth-log",
  "method": "pipe",
  "command": "tail -f /var/log/auth.log | grep -v 'CRON'"
}
```

### 3. 여러 앱 로그 통합

여러 로그 파일에서 에러/경고만 합쳐서 수집합니다.

```json
{
  "name": "app-combined",
  "method": "pipe",
  "command": "tail -f /app/logs/*.log | grep -E '(ERROR|WARN)'"
}
```

### 4. 커스텀 모니터링 스크립트

쉘 스크립트 출력을 주기적으로 전송합니다.

```json
{
  "name": "custom-check",
  "method": "pipe",
  "command": "/opt/scripts/health-check.sh"
}
```

---

## 주의 사항

- `pipe` 방식의 `command`는 `/bin/sh -c "<command>"` 로 실행됩니다.
- 명령이 종료되면 Ward 에이전트가 자동으로 재시작합니다.
- 무한 스트림(`tail -f` 등)을 사용하는 것이 일반적입니다.
- 명령이 너무 빠르게 많은 출력을 낼 경우 백프레셔(back-pressure) 메커니즘이 적용됩니다.

---

## 설정 파일 위치 및 적용

```bash
# 설정 파일 편집
vi ~/.ward/config.json

# 에이전트 재시작
ward restart
```

이 샘플의 `config.json`을 `~/.ward/config.json`에 복사한 후 환경에 맞게 수정하세요.

---

## 트러블슈팅

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| 로그가 전송되지 않음 | 명령이 즉시 종료됨 | `tail -f` 등 지속적 출력 명령 사용 |
| 명령 실행 오류 | 명령어 또는 경로 오타 | 서버에서 직접 명령 실행하여 테스트 |
| 특수문자 문제 | JSON 이스케이프 필요 | `\"` 등으로 이스케이프 처리 |
