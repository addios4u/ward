# Phase 1 — 기반 구축

## 목표
모노레포 초기 세팅 및 server 패키지 기본 구조 구축

## 작업 목록

### 1-1. 모노레포 루트 세팅
- [ ] 루트 `package.json` 생성 (pnpm workspaces 설정)
- [ ] `pnpm-workspace.yaml` 생성
- [ ] 공통 `tsconfig.base.json` 생성
- [ ] 루트 `tsconfig.json` 생성
- [ ] 공통 개발 의존성 설치 (typescript, prettier, eslint)
- [ ] `.prettierrc`, `.eslintrc` 설정

### 1-2. packages/server 기본 세팅
- [ ] `package.json` 생성
- [ ] `tsconfig.json` 생성
- [ ] Express 앱 기본 구조 생성 (`src/app.ts`, `src/index.ts`)
- [ ] 환경변수 로드 설정 (dotenv, `.env` 루트 파일 참조)
- [ ] 헬스체크 엔드포인트 (`GET /health`)
- [ ] 테스트 환경 구성 (vitest 또는 jest)
- [ ] 기본 테스트 케이스 작성 및 통과 확인

### 1-3. PostgreSQL 연결
- [ ] DB 클라이언트 설치 (pg + drizzle-orm 또는 prisma)
- [ ] DB 연결 모듈 작성 (`src/db/index.ts`)
- [ ] 마이그레이션 도구 설정
- [ ] 초기 스키마 마이그레이션 작성 (servers, users 테이블)
- [ ] 마이그레이션 실행 스크립트

### 1-4. 에이전트 등록 API
- [ ] `POST /api/servers` — 서버 등록 + API 키 발급
- [ ] `GET /api/servers` — 서버 목록 조회
- [ ] API 키 생성 유틸리티
- [ ] 각 엔드포인트 테스트 케이스 작성

## 완료 기준
- `pnpm install` 정상 동작
- server 앱이 정상 기동
- `/health` 응답 확인
- DB 연결 및 마이그레이션 성공
- 서버 등록 API 테스트 통과
