# Ward 샘플 모음

이 폴더에는 Ward 에이전트 설정 및 API 활용에 대한 실용적인 예제들이 포함되어 있습니다.

---

## 전체 샘플 목록

| 번호 | 폴더 | 설명 |
|------|------|------|
| 01 | `01-quick-start/` | Ward 에이전트를 처음 설치하고 빠르게 시작하는 방법 |
| 02 | `02-single-server/` | 단일 서버를 모니터링하는 기본 설정 |
| 03 | `03-multi-server-groups/` | 여러 서버를 그룹으로 묶어 관리하는 설정 |
| 04 | `04-nodejs-service/` | Node.js 애플리케이션 로그를 Ward로 수집하는 방법 |
| 05 | `05-docker-monitoring/` | Docker 컨테이너 로그를 Ward로 수집하는 방법 |
| 06 | `06-webserver-logs/` | Nginx / Apache 웹서버 로그 수집 설정 |
| 07 | `07-systemd-monitoring/` | systemd 서비스의 저널 로그를 Ward로 수집하는 방법 |
| 08 | `08-pipe-logging/` | 쉘 파이프를 활용한 실시간 로그 스트리밍 |
| 09 | `09-multi-admin/` | 팀 환경에서 여러 관리자 계정으로 Ward를 운영하는 방법 |
| 10 | `10-api-integration/` | Ward REST API를 외부 스크립트/CI/CD에서 활용하는 방법 |

---

## 상황별 가이드

### 처음 Ward를 설치하는 경우

```
01-quick-start  →  02-single-server
```

### 여러 서버를 한꺼번에 관리하고 싶은 경우

```
03-multi-server-groups
```

### 특정 서비스 로그를 수집하고 싶은 경우

```
Node.js 앱     →  04-nodejs-service
Docker 컨테이너 →  05-docker-monitoring
Nginx / Apache  →  06-webserver-logs
systemd 서비스  →  07-systemd-monitoring
임의 명령/파이프 →  08-pipe-logging
```

### 팀에서 함께 Ward를 사용하는 경우

```
09-multi-admin
```

### 배포 자동화 / 외부 스크립트에서 Ward를 활용하는 경우

```
10-api-integration
```

---

## 빠른 시작 플로우차트

```
Ward 처음 사용?
│
├─ YES ──→ [01-quick-start] 에이전트 설치 및 서버 등록
│               │
│               ↓
│          단일 서버인가?
│          ├─ YES ──→ [02-single-server] 기본 설정 완료
│          └─ NO  ──→ [03-multi-server-groups] 그룹 설정
│
└─ NO (이미 설치됨)
     │
     ├─ 로그 수집 방식 선택
     │    ├─ Node.js 앱     ──→ [04-nodejs-service]
     │    ├─ Docker         ──→ [05-docker-monitoring]
     │    ├─ Nginx/Apache   ──→ [06-webserver-logs]
     │    ├─ systemd 서비스  ──→ [07-systemd-monitoring]
     │    └─ 그 외 명령/파이프 ──→ [08-pipe-logging]
     │
     ├─ 팀 계정 관리
     │    └─ [09-multi-admin]
     │
     └─ 자동화 / CI/CD 연동
          └─ [10-api-integration]
```

---

## 설정 파일 위치

Ward 에이전트의 설정 파일은 `~/.ward/config.json`에 위치합니다.
각 샘플 폴더의 `config.json`을 복사한 후 환경에 맞게 수정하여 사용하세요.

```bash
# 예시: 07번 샘플 설정 적용
cp samples/07-systemd-monitoring/config.json ~/.ward/config.json
vi ~/.ward/config.json  # 환경에 맞게 수정

# 에이전트 재시작
ward restart
```

---

## 서비스 수집 방식(method) 요약

| 방식 | 설명 | 샘플 |
|------|------|------|
| `file` | 로그 파일을 tail하여 수집 | 06-webserver-logs |
| `exec` | 명령어를 실행하고 stdout 수집 | 04-nodejs-service |
| `journal` | systemd journalctl로 수집 | 07-systemd-monitoring |
| `docker` | Docker 컨테이너 로그 수집 | 05-docker-monitoring |
| `pipe` | 쉘 파이프 포함 명령 실행 및 수집 | 08-pipe-logging |
