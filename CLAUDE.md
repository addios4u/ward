# Ward - 서버 모니터링 시스템

## 프로젝트 개요

pm2와 유사한 **Self-hosted 서버 모니터링 시스템**.
SaaS가 아닌, 중소규모 팀이 자체 인프라에 직접 설치해서 운영하는 방식.
팀의 서버 상태를 실시간으로 모니터링하는 것이 핵심 목적.

---

## 모노레포 구조

```
ward/
├── packages/
│   ├── server/     # 중앙 백엔드 서버
│   ├── agent/      # 서버 에이전트
│   └── web/        # 관리자 대시보드
└── docker/         # Docker 설정
```

### packages/server
- 에이전트로부터 모니터링 데이터를 수신·저장하는 중앙 서버
- Node.js v22 + Express + TypeScript
- **일반적으로 web과 같은 서버에서 Docker로 함께 운영**
- 대규모 운영 시 web과 분리 가능

### packages/agent
- 모니터링 대상 서버(리눅스 등)에 설치하는 에이전트
- **시스템 메트릭** (CPU, 메모리, 디스크, 프로세스 등) 수집 및 전송
- **로그 포워딩** (PHP, Node.js, Nginx, Apache 등 앱 로그 실시간 전송)
- Node.js v22 + TypeScript (성능이 필요한 경우 Rust 사용 가능)
- CLI 명령어로 제어

### packages/web
- 관리자가 서버 상태를 모니터링하는 웹 대시보드
- Next.js + TypeScript
- **일반적으로 server와 같은 서버에서 Docker로 함께 운영**

---

## 기술 스택

| 패키지 | 기술 |
|--------|------|
| server | Node.js v22, Express, TypeScript |
| agent  | Node.js v22, TypeScript (필요 시 Rust) |
| web    | Next.js, TypeScript |
| 인프라 | Docker, Docker Compose |

- Node.js 버전: v22.16.0 (`.nvmrc` 기준)
- TypeScript를 모든 Node.js 프로젝트에서 적극 사용

---

## 배포 방식

- `docker-compose up` 수준의 간단한 설치를 목표로 함
- server + web을 Docker Compose로 함께 구성 (기본)
- 필요 시 분리 배포 옵션 제공

---

## 개발 규칙

### TDD (테스트 주도 개발)
- **모든 기능은 테스트 케이스를 먼저 작성하고, 테스트 통과 후 구현 완료로 간주**
- 테스트 없이 구현 코드만 작성하지 않음

### Git 커밋
- **아주 작은 단위의 작업이라도 반드시 git commit**
- 커밋 메시지는 한글로 작성
- 커밋은 자동으로 진행

### 작업 방식
- **멀티에이전트를 적극 활용해 병렬로 작업 진행**
- 독립적인 작업은 동시에 처리해서 속도를 높임

---

## 언어 규칙

- **모든 코드 주석, 문서, 커밋 메시지, 대화는 한글로 작성**
- 변수명·함수명 등 코드 식별자는 영어 사용 (일반적인 관례 따름)
