# 샘플 05: Docker 컨테이너 모니터링

Ward의 `docker` 방식을 사용해 Docker 컨테이너 로그를 중앙 서버로 수집하는 예시입니다.

---

## 개요

`docker` 방식은 내부적으로 `docker logs -f <container>`를 실행해 컨테이너의 stdout/stderr 스트림을 실시간으로 수집합니다. Ward 에이전트가 설치된 호스트에서 Docker 소켓(`/var/run/docker.sock`)에 접근 가능하면 동작합니다.

---

## docker 방식 서비스 등록

### CLI로 등록

```bash
ward service add '{
  "name": "web-container",
  "method": "docker",
  "container": "my-web-app"
}'
```

### config.json 직접 편집

`~/.ward/config.json`의 `services` 배열에 항목을 추가한 뒤 에이전트를 재시작합니다.

```bash
ward restart
```

---

## 컨테이너 이름 vs ID 사용 가이드

| 구분 | 예시 | 권장 여부 |
|------|------|-----------|
| 컨테이너 이름 | `"container": "my-web-app"` | 권장 |
| 컨테이너 ID (전체) | `"container": "a1b2c3d4e5f6..."` | 비권장 |
| 컨테이너 ID (단축) | `"container": "a1b2c3d4"` | 비권장 |

- **컨테이너 이름 사용을 권장합니다.** 컨테이너를 재생성해도 이름이 동일하면 Ward 설정을 변경할 필요가 없습니다.
- ID는 컨테이너 재생성 시 변경되므로, 매번 Ward 설정을 업데이트해야 합니다.
- `docker-compose`를 사용하면 컨테이너 이름이 자동으로 `<프로젝트명>_<서비스명>_1` 형태로 지정됩니다.

```bash
# 실행 중인 컨테이너 이름 확인
docker ps --format "{{.Names}}"
```

---

## 컨테이너 재시작 원격 제어

Ward 대시보드 또는 API를 통해 컨테이너를 원격으로 재시작할 수 있습니다.

### 대시보드에서 재시작

1. 서버 상세 페이지 → 서비스 목록에서 해당 컨테이너 서비스 선택
2. "재시작" 버튼 클릭
3. Ward 에이전트가 `docker restart <container>` 명령을 실행합니다.

### API로 재시작

```bash
curl -X POST http://<ward-server>:4000/api/servers/<server-id>/services/web-container/restart
```

---

## docker-compose 환경에서 활용법

docker-compose로 구성한 서비스들을 Ward로 모니터링하는 방법입니다.

### 1. 컨테이너 이름 고정 (권장)

`docker-compose.yml`에서 `container_name`을 명시적으로 지정하면 이름이 고정됩니다.

```yaml
services:
  web:
    image: nginx:alpine
    container_name: my-web-app  # 이름 고정
```

### 2. Ward 에이전트를 같은 호스트에 설치

Ward 에이전트는 Docker 컨테이너 **밖**의 호스트에 설치해야 `docker` 명령에 접근할 수 있습니다.

```
호스트 (Ward 에이전트 실행)
  └── Docker
        ├── my-web-app (컨테이너)
        ├── my-api-server (컨테이너)
        └── my-worker (컨테이너)
```

### 3. Ward 에이전트 자체도 컨테이너로 운영하는 경우

Docker 소켓을 볼륨 마운트로 공유하면 컨테이너 안에서도 `docker` 명령을 사용할 수 있습니다.

```yaml
services:
  ward-agent:
    image: ward-agent:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ~/.ward:/root/.ward
```

---

## 주의사항

- Ward 에이전트 프로세스(또는 실행 사용자)가 `docker` 명령을 실행할 수 있는 권한이 있어야 합니다.
- 권한 부족 시: `sudo usermod -aG docker <ward-user>` 후 로그아웃/재로그인
- 모니터링 대상 컨테이너가 중지 상태이면 로그 수집도 중단됩니다. 컨테이너가 재시작되면 Ward가 자동으로 다시 연결합니다.
