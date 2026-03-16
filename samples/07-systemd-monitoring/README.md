# 샘플 07: Systemd 서비스 모니터링

이 샘플은 `journal` 방식을 사용해 systemd 서비스의 상태와 저널 로그를 Ward로 수집하는 방법을 안내합니다.

---

## journal 방식이란?

`journal` 방식은 `journalctl -u <unit> -f` 명령을 내부적으로 실행해 systemd 서비스의 로그를 실시간으로 수집합니다.

- systemd 기반의 Linux 배포판(Ubuntu 16.04+, CentOS 7+, Debian 8+ 등)에서 사용 가능
- 별도 로그 파일 경로 설정 없이 서비스 이름(unit)만 지정하면 됨
- 서비스가 재시작되더라도 자동으로 로그 스트리밍이 이어짐

```json
{
  "name": "nginx",
  "method": "journal",
  "unit": "nginx.service"
}
```

---

## systemd unit 이름 확인 방법

### 실행 중인 서비스 전체 목록 보기

```bash
systemctl list-units --type=service --state=running
```

### 특정 서비스 검색

```bash
systemctl list-units --type=service | grep nginx
```

### 서비스 상태 상세 확인

```bash
systemctl status nginx.service
```

출력 예시:

```
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)
     Active: active (running) since Mon 2026-03-16 09:00:00 UTC; 2h ago
```

### 저널 로그 직접 확인

```bash
journalctl -u nginx.service -f
```

---

## 권한 설정

Ward 에이전트가 `journalctl` 명령에 접근하려면 실행 사용자에게 적절한 권한이 필요합니다.

### systemd-journal 그룹에 사용자 추가

ward 에이전트를 실행하는 사용자(예: `ward`)를 `systemd-journal` 그룹에 추가합니다.

```bash
# 그룹에 사용자 추가
sudo usermod -aG systemd-journal ward

# 적용 확인
groups ward
```

### sudo 권한으로 journalctl 허용 (권장하지 않음)

보안상 이유로 `systemd-journal` 그룹 추가 방식을 권장합니다. sudo를 사용할 경우 최소 권한 원칙에 따라 journalctl만 허용합니다.

```
# /etc/sudoers.d/ward
ward ALL=(root) NOPASSWD: /usr/bin/journalctl
```

### 권한 확인

```bash
# ward 사용자로 전환 후 테스트
su -s /bin/bash ward -c "journalctl -u nginx.service -n 5"
```

---

## 서비스 재시작 원격 제어

Ward 대시보드 또는 API를 통해 모니터링 중인 서비스를 원격으로 재시작할 수 있습니다.

### 웹 대시보드에서 재시작

1. Ward 대시보드 접속
2. 해당 서버 클릭
3. 서비스 목록에서 재시작할 서비스 선택
4. "재시작" 버튼 클릭

### API를 통한 재시작

```bash
# 로그인 후 쿠키 저장
curl -s -c cookies.txt -X POST http://ward-server:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# 서비스 재시작
curl -s -b cookies.txt -X POST \
  http://ward-server:4000/api/servers/<server-id>/services/nginx/restart
```

재시작 명령은 에이전트가 수신하여 `systemctl restart <unit>` 을 실행합니다.

> **참고**: 서비스 재시작 권한도 별도로 설정이 필요할 수 있습니다. 에이전트 실행 사용자가 해당 서비스를 재시작할 수 있도록 sudoers 설정을 확인하세요.

---

## 설정 파일 위치 및 적용

```bash
# 설정 파일 편집
vi ~/.ward/config.json

# 에이전트 재시작하여 설정 적용
ward restart
# 또는
systemctl restart ward-agent
```

이 샘플의 `config.json`을 `~/.ward/config.json`에 복사한 후 환경에 맞게 수정하세요.

---

## 트러블슈팅

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| 로그가 수집되지 않음 | journalctl 접근 권한 없음 | `systemd-journal` 그룹 추가 |
| unit을 찾을 수 없음 | unit 이름 오타 또는 서비스 미설치 | `systemctl list-units`로 이름 확인 |
| 오래된 로그만 보임 | 서비스가 inactive 상태 | `systemctl start <unit>`으로 서비스 시작 |
