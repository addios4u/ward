# 다중 서버 그룹 관리

프로덕션, 스테이징, 개발 환경별로 서버를 그룹화하여 관리하는 가이드입니다.

---

## 그룹 개념

Ward에서는 `--name` 플래그를 사용해 에이전트가 속할 **그룹명**을 지정할 수 있습니다.

그룹을 사용하면:
- 대시보드에서 환경별로 서버를 필터링할 수 있습니다.
- 프로덕션/스테이징/개발 서버를 한 Ward 서버에서 구분해서 관리할 수 있습니다.
- 팀별, 서비스별로 서버를 논리적으로 분리할 수 있습니다.

---

## 각 환경별 에이전트 설정 방법

### 프로덕션 서버

```bash
ward start http://ward-server:4000 --name production
```

또는 이 샘플의 `production-config.json`을 `~/.ward/config.json`으로 복사한 후 시작:

```bash
cp production-config.json ~/.ward/config.json
ward start http://ward-server:4000
```

### 스테이징 서버

```bash
ward start http://ward-server:4000 --name staging
```

또는 `staging-config.json` 사용:

```bash
cp staging-config.json ~/.ward/config.json
ward start http://ward-server:4000
```

### 개발 서버

```bash
ward start http://ward-server:4000 --name development
```

또는 `development-config.json` 사용:

```bash
cp development-config.json ~/.ward/config.json
ward start http://ward-server:4000
```

---

## 환경별 설정 차이

| 환경 | 그룹명 | 수집 주기 | 설명 |
|------|--------|-----------|------|
| 프로덕션 | `production` | 30초 | 실시간에 가까운 모니터링 |
| 스테이징 | `staging` | 60초 | 적당한 주기로 모니터링 |
| 개발 | `development` | 10초 | 빠른 피드백을 위한 짧은 주기 |

---

## 빠른 설정: setup.sh 사용

이 샘플의 `setup.sh` 스크립트를 사용하면 그룹명과 서버 URL을 인자로 넘겨 한 번에 설정할 수 있습니다.

```bash
# 스크립트에 실행 권한 부여
chmod +x setup.sh

# 프로덕션 서버에서 실행
./setup.sh production http://ward-server:4000

# 스테이징 서버에서 실행
./setup.sh staging http://ward-server:4000

# 개발 서버에서 실행
./setup.sh development http://ward-server:4000
```

---

## 대시보드에서 그룹별 필터링 확인 방법

1. 웹 브라우저에서 `http://your-server` 에 접속합니다.
2. 대시보드 상단 또는 사이드바에서 **그룹 필터** 메뉴를 찾습니다.
3. `production`, `staging`, `development` 중 원하는 그룹을 선택하면 해당 환경의 서버만 표시됩니다.
4. 전체 서버를 보려면 필터를 **전체**로 설정합니다.
