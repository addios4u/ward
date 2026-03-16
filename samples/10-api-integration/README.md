# 샘플 10: 외부 시스템 API 연동

이 샘플은 Ward REST API를 외부 스크립트나 CI/CD 파이프라인에서 사용하는 방법을 안내합니다.

---

## 인증 방법 (세션 쿠키)

Ward API는 세션 쿠키 기반 인증을 사용합니다. 모든 API 호출 전에 로그인하여 쿠키를 저장해야 합니다.

```bash
# 로그인 후 쿠키를 파일에 저장
curl -s -c cookies.txt -X POST http://ward-server:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# 이후 요청에는 -b cookies.txt 옵션으로 쿠키 전송
curl -s -b cookies.txt http://ward-server:4000/api/servers
```

---

## 주요 API 엔드포인트

### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 (세션 쿠키 발급) |

### 서버 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/servers` | 등록된 서버 목록 조회 |
| GET | `/api/servers/:id/status` | 특정 서버 현재 상태 조회 |
| GET | `/api/servers/:id/metrics?limit=60` | 서버 메트릭 히스토리 조회 |
| GET | `/api/servers/:id/logs?level=error&limit=100` | 서버 로그 조회 |
| POST | `/api/servers/:id/services/:name/restart` | 서비스 재시작 |

### 관리자 계정

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/users` | 관리자 목록 조회 |
| POST | `/api/users` | 새 관리자 계정 생성 |
| DELETE | `/api/users/:id` | 관리자 계정 삭제 |
| PATCH | `/api/users/:id/password` | 비밀번호 변경 |

---

## API 응답 예시

### 서버 목록 (`GET /api/servers`)

```json
{
  "servers": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "web-server-01",
      "groupName": "production",
      "status": "online",
      "lastSeenAt": "2026-03-16T09:00:00.000Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "db-server-01",
      "groupName": "production",
      "status": "offline",
      "lastSeenAt": "2026-03-15T22:30:00.000Z"
    }
  ]
}
```

### 서버 상태 (`GET /api/servers/:id/status`)

```json
{
  "server": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "web-server-01",
    "status": "online",
    "hostname": "web-01",
    "publicIp": "203.0.113.1"
  },
  "latestMetric": {
    "cpuUsage": 42.5,
    "memTotal": 8589934592,
    "memUsed": 3221225472,
    "loadAvg": [1.2, 1.5, 1.3]
  }
}
```

---

## CI/CD 파이프라인 연동 예시

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: 배포 후 헬스 체크

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: 애플리케이션 배포
        run: |
          # 배포 명령 실행
          ssh deploy@your-server "cd /app && git pull && npm run build && pm2 restart app"

      - name: Ward 헬스 체크
        env:
          WARD_URL: ${{ secrets.WARD_URL }}
          WARD_EMAIL: ${{ secrets.WARD_EMAIL }}
          WARD_PASSWORD: ${{ secrets.WARD_PASSWORD }}
          SERVER_ID: ${{ secrets.WARD_SERVER_ID }}
        run: |
          chmod +x ./samples/10-api-integration/ci-health-check.sh
          ./samples/10-api-integration/ci-health-check.sh "$SERVER_ID" "my-app"
```

### GitLab CI

```yaml
# .gitlab-ci.yml
deploy_and_check:
  stage: deploy
  script:
    - # 배포 명령
    - chmod +x samples/10-api-integration/ci-health-check.sh
    - ./samples/10-api-integration/ci-health-check.sh "$WARD_SERVER_ID" "my-app"
  variables:
    WARD_URL: "http://ward-server:4000"
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    environment {
        WARD_URL = credentials('ward-url')
        WARD_EMAIL = credentials('ward-email')
        WARD_PASSWORD = credentials('ward-password')
    }
    stages {
        stage('Deploy') {
            steps {
                sh 'your-deploy-command.sh'
            }
        }
        stage('Health Check') {
            steps {
                sh 'chmod +x samples/10-api-integration/ci-health-check.sh'
                sh './samples/10-api-integration/ci-health-check.sh ${SERVER_ID} my-app'
            }
        }
    }
}
```

---

## 포함된 스크립트

| 스크립트 | 설명 |
|----------|------|
| `check-server-status.sh` | 전체 서버 상태 체크, offline 감지 시 비제로 종료 |
| `restart-service.sh` | 특정 서버의 서비스 재시작 |
| `get-metrics.sh` | 서버 메트릭 히스토리 JSON 출력 |
| `ci-health-check.sh` | CI/CD 배포 후 헬스 체크 |

```bash
# 실행 권한 부여
chmod +x *.sh

# 사용 예시
./check-server-status.sh
./restart-service.sh a1b2c3d4-e5f6-7890-abcd-ef1234567890 nginx
./get-metrics.sh a1b2c3d4-e5f6-7890-abcd-ef1234567890 30
./ci-health-check.sh a1b2c3d4-e5f6-7890-abcd-ef1234567890 my-app
```
