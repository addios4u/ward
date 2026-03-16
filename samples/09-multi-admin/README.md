# 샘플 09: 다중 관리자 팀 운영

이 샘플은 팀 환경에서 여러 관리자 계정으로 Ward를 운영하는 방법을 안내합니다.

---

## 관리자 계정 생성

### 웹 UI에서 계정 생성

1. Ward 대시보드에 기존 관리자 계정으로 로그인
2. 우측 상단 사용자 메뉴 → **관리자 설정** 클릭
3. **새 관리자 추가** 버튼 클릭
4. 이메일과 비밀번호 입력 후 저장

### API로 계정 생성

```bash
# 1. 로그인하여 세션 쿠키 저장
curl -s -c cookies.txt -X POST http://ward-server:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'

# 2. 새 관리자 계정 생성
curl -s -b cookies.txt -X POST http://ward-server:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"newadmin@example.com","password":"secure-password"}'
```

응답 예시:

```json
{
  "id": "usr_abc123",
  "email": "newadmin@example.com",
  "createdAt": "2026-03-16T09:00:00.000Z"
}
```

---

## 관리자 목록 조회

```bash
# 현재 등록된 관리자 목록 확인
curl -s -b cookies.txt http://ward-server:4000/api/users | jq .
```

응답 예시:

```json
[
  {
    "id": "usr_001",
    "email": "admin@example.com",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "usr_002",
    "email": "devops@example.com",
    "createdAt": "2026-03-10T10:00:00.000Z"
  }
]
```

---

## 계정 삭제

### 웹 UI에서 삭제

1. Ward 대시보드 → 관리자 설정
2. 삭제할 계정 우측 **삭제** 버튼 클릭
3. 확인 다이얼로그에서 **삭제** 클릭

### API로 삭제

```bash
# 특정 사용자 삭제 (user ID 필요)
curl -s -b cookies.txt -X DELETE http://ward-server:4000/api/users/usr_002
```

> **주의**: 마지막 관리자 계정은 삭제할 수 없습니다. 최소 1개의 계정이 유지되어야 합니다.

---

## 비밀번호 변경

### 웹 UI에서 변경

1. Ward 대시보드 → 프로필 설정
2. **비밀번호 변경** 클릭
3. 현재 비밀번호와 새 비밀번호 입력

### API로 변경

```bash
# 특정 사용자의 비밀번호 변경
curl -s -b cookies.txt -X PATCH http://ward-server:4000/api/users/usr_001/password \
  -H "Content-Type: application/json" \
  -d '{"password":"new-secure-password"}'
```

---

## 보안 권장 사항

### 강력한 비밀번호 정책

- 최소 12자 이상
- 대/소문자, 숫자, 특수문자 조합
- 사전 단어 사용 금지
- 팀원별 개별 계정 사용 (공유 계정 지양)

### 정기적인 계정 관리

```bash
# 주기적으로 계정 목록을 확인하고 퇴사자 계정 즉시 삭제
curl -s -b cookies.txt http://ward-server:4000/api/users | jq '.[].email'
```

### 네트워크 접근 제한

Ward 대시보드는 내부 네트워크 또는 VPN에서만 접근하도록 제한하는 것을 권장합니다.

```nginx
# nginx 예시: 특정 IP 대역만 허용
location / {
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;
    proxy_pass http://ward-web:3000;
}
```

### HTTPS 사용

프로덕션 환경에서는 반드시 HTTPS를 통해 Ward에 접근하도록 설정합니다.

```yaml
# docker-compose.yml에 SSL 터미네이션 프록시 추가
services:
  nginx-proxy:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    ports:
      - "443:443"
```

---

## 스크립트로 계정 관리

이 샘플에 포함된 `manage-users.sh` 스크립트를 활용하면 계정 관리를 더 편리하게 할 수 있습니다.

```bash
chmod +x manage-users.sh

# 계정 목록 조회
./manage-users.sh list

# 계정 추가
./manage-users.sh add devops@example.com secure-password

# 계정 삭제
./manage-users.sh delete usr_002

# 비밀번호 변경
./manage-users.sh change-password usr_001 new-password
```

자세한 사용법은 `manage-users.sh --help` 를 참고하세요.
