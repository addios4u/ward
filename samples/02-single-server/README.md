# 단일 서버 기본 모니터링

단일 서버에서 CPU, 메모리, 디스크, 네트워크 등 기본 메트릭을 모니터링하는 설정 가이드입니다.

---

## 1단계: 에이전트 설치 및 시작

`@devskeo/ward-agent`는 npm에 출시되어 있지 않으므로, 소스에서 빌드해서 설치합니다.

모니터링할 서버에서 아래 명령을 실행합니다.

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

에이전트를 Ward 서버에 연결합니다:

```bash
ward start http://ward-server:4000
```

---

## 수집되는 메트릭 목록

Ward 에이전트는 아래 메트릭을 자동으로 수집합니다.

| 분류 | 메트릭 | 설명 |
|------|--------|------|
| CPU | 사용률 (%) | 전체 코어 평균 사용률 |
| CPU | 코어별 사용률 | 각 코어의 개별 사용률 |
| 메모리 | 전체 용량 | 총 메모리 크기 (MB) |
| 메모리 | 사용량 | 현재 사용 중인 메모리 (MB) |
| 메모리 | 사용률 (%) | 메모리 사용 비율 |
| 디스크 | 마운트 포인트별 용량 | 각 파티션의 전체/사용/여유 공간 |
| 디스크 | 사용률 (%) | 파티션별 사용 비율 |
| 네트워크 | 수신/송신 바이트 | 인터페이스별 트래픽 |
| 네트워크 | 수신/송신 속도 | 초당 바이트 (bps) |
| 프로세스 | 실행 중인 프로세스 수 | 전체 프로세스 개수 |
| 시스템 | 업타임 | 서버 가동 시간 |
| 시스템 | 로드 에버리지 | 1분/5분/15분 평균 부하 |

---

## 메트릭 수집 주기 변경 방법

`~/.ward/config.json` 파일에서 `metrics.interval` 값을 변경합니다. 단위는 **초(seconds)**입니다.

```json
{
  "server": {
    "url": "http://ward-server:4000"
  },
  "metrics": {
    "interval": 30
  },
  "services": []
}
```

이 샘플의 `config.json` 파일을 참고해서 `~/.ward/config.json`에 적용할 수 있습니다.

설정 변경 후 에이전트를 재시작합니다:

```bash
ward stop
ward start http://ward-server:4000
```

---

## 에이전트 상태 확인 방법

현재 에이전트 상태와 연결 정보를 확인합니다:

```bash
ward status
```

출력 예시:

```
Ward Agent 상태
─────────────────────────────
상태:       실행 중
서버:       http://ward-server:4000
그룹:       (없음)
수집 주기:  30초
마지막 전송: 2초 전
```

---

## systemd로 자동 시작 설정

서버가 재부팅되어도 에이전트가 자동으로 시작되도록 systemd 서비스로 등록합니다.

Linux에서 `ward start` 명령 실행 시 자동으로 systemd 서비스가 등록됩니다.

수동으로 등록하려면:

```bash
ward systemd install
```

서비스 등록 후 활성화:

```bash
sudo systemctl enable ward-agent
sudo systemctl start ward-agent
```

서비스 상태 확인:

```bash
sudo systemctl status ward-agent
```

systemd 등록을 해제하려면:

```bash
ward systemd uninstall
```
