# 샘플 04: Node.js 앱 서비스 관리

Ward를 사용해 Node.js 애플리케이션을 pm2 없이 관리하는 예시입니다.

---

## 개요

Ward의 `exec` 방식을 사용하면 Node.js 프로세스를 직접 실행하고, 종료 시 자동으로 재시작하며, 로그를 중앙 서버로 전송할 수 있습니다. pm2의 핵심 기능을 Ward 하나로 대체할 수 있습니다.

---

## exec 방식 서비스 등록

`exec` 방식은 지정한 명령어를 직접 실행하고 stdout/stderr를 수집합니다.

### CLI로 등록

```bash
ward service add '{
  "name": "api-server",
  "method": "exec",
  "command": "node /app/dist/index.js",
  "restartDelay": 3000,
  "maxMemBytes": 536870912
}'
```

### config.json 직접 편집

`~/.ward/config.json`의 `services` 배열에 항목을 추가한 뒤 에이전트를 재시작합니다.

```bash
# 에이전트 재시작
ward restart
```

---

## 자동 재시작 동작

- 프로세스가 종료되면 `restartDelay` (밀리초) 후 자동으로 재시작합니다.
- `restartDelay: 3000` → 3초 후 재시작
- 재시작 횟수와 마지막 재시작 시각은 대시보드에서 확인할 수 있습니다.
- 의도적으로 중지하려면 대시보드 또는 API를 통해 서비스를 중지하세요. 중지 상태에서는 자동 재시작이 동작하지 않습니다.

---

## 메모리 제한 설정 (maxMemBytes)

`maxMemBytes` 값을 초과하면 프로세스를 강제 종료 후 재시작합니다.

| 설정값 | 용량 |
|--------|------|
| `268435456` | 256 MB |
| `536870912` | 512 MB |
| `1073741824` | 1 GB |

```json
{
  "name": "api-server",
  "method": "exec",
  "command": "node /app/dist/index.js",
  "maxMemBytes": 536870912
}
```

---

## 로그 실시간 확인 방법

Ward 대시보드(`http://<ward-server>:3000`)에 접속한 뒤:

1. 좌측 서버 목록에서 해당 서버를 선택합니다.
2. 상세 페이지 우측 로그 영역에서 실시간 로그 스트림을 확인합니다.
3. 서비스 필터를 사용해 `api-server` 또는 `worker`만 골라서 볼 수 있습니다.

---

## 원격 재시작 방법

### 대시보드에서 재시작

1. 서버 상세 페이지 → 서비스 목록에서 해당 서비스 선택
2. "재시작" 버튼 클릭

### API로 재시작

```bash
curl -X POST http://<ward-server>:4000/api/servers/<server-id>/services/api-server/restart
```

---

## pm2에서 Ward로 마이그레이션 체크리스트

- [ ] 현재 pm2로 실행 중인 앱 목록 확인 (`pm2 list`)
- [ ] 각 앱의 실행 명령어, 환경변수, 메모리 제한 확인 (`pm2 show <name>`)
- [ ] `~/.ward/config.json`의 `services` 배열에 동일한 설정으로 항목 추가
- [ ] Ward 에이전트 재시작 (`ward restart`)
- [ ] 대시보드에서 프로세스 정상 실행 및 로그 수신 확인
- [ ] pm2 앱 중지 및 제거 (`pm2 stop <name>` → `pm2 delete <name>`)
- [ ] pm2 startup 설정 제거 (필요 시)
- [ ] Ward 에이전트 시스템 서비스 등록 (systemd 등)으로 서버 재부팅 후에도 자동 실행 확인
