# 샘플 06: Nginx/Apache 웹서버 로그 포워딩

Ward의 `file` 방식을 사용해 Nginx 및 Apache 로그 파일을 실시간으로 중앙 서버에 전송하는 예시입니다.

---

## 개요

`file` 방식은 지정한 파일 경로를 `tail -f` 방식으로 감시하고, 새로 추가된 내용을 Ward 서버로 실시간 전송합니다. 여러 로그 파일을 하나의 서비스로 묶어 수집할 수 있습니다.

---

## file 방식 서비스 등록

### CLI로 등록

```bash
ward service add '{
  "name": "nginx-access",
  "method": "file",
  "paths": [
    "/var/log/nginx/access.log",
    "/var/log/nginx/site1-access.log"
  ]
}'
```

### config.json 직접 편집

`~/.ward/config.json`의 `services` 배열에 항목을 추가한 뒤 에이전트를 재시작합니다.

```bash
ward restart
```

---

## 로그 파일 권한 설정

Ward 에이전트가 로그 파일을 읽으려면 실행 사용자에게 읽기 권한이 있어야 합니다.

### 방법 1: ward 사용자를 로그 그룹에 추가 (권장)

```bash
# Nginx 로그 그룹에 ward 사용자 추가
sudo usermod -aG adm ward

# Apache 로그 그룹에 ward 사용자 추가 (Ubuntu/Debian)
sudo usermod -aG adm ward

# 변경 적용을 위해 재로그인 또는 에이전트 재시작
sudo systemctl restart ward-agent
```

### 방법 2: 로그 파일 권한 직접 변경

```bash
# Nginx 로그 파일 읽기 권한 추가
sudo chmod o+r /var/log/nginx/*.log

# Apache 로그 파일 읽기 권한 추가
sudo chmod o+r /var/log/apache2/*.log
```

### 방법 3: ACL 사용

```bash
# ward 사용자에게만 읽기 권한 부여
sudo setfacl -m u:ward:r /var/log/nginx/access.log
sudo setfacl -m u:ward:r /var/log/nginx/error.log
```

---

## 여러 사이트의 로그를 동시에 수집하는 방법

하나의 서비스에 `paths` 배열로 여러 파일을 지정하거나, 사이트별로 별도 서비스를 등록할 수 있습니다.

### 방법 1: 하나의 서비스에 여러 파일 묶기

같은 성격의 로그(예: 모든 사이트의 access 로그)를 묶어서 관리합니다.

```json
{
  "name": "nginx-access-all",
  "method": "file",
  "paths": [
    "/var/log/nginx/access.log",
    "/var/log/nginx/site1-access.log",
    "/var/log/nginx/site2-access.log"
  ]
}
```

### 방법 2: 사이트별 서비스 등록

각 사이트를 독립된 서비스로 등록하면 대시보드에서 사이트별로 필터링할 수 있습니다.

```json
[
  {
    "name": "site1-nginx",
    "method": "file",
    "paths": [
      "/var/log/nginx/site1-access.log",
      "/var/log/nginx/site1-error.log"
    ]
  },
  {
    "name": "site2-nginx",
    "method": "file",
    "paths": [
      "/var/log/nginx/site2-access.log",
      "/var/log/nginx/site2-error.log"
    ]
  }
]
```

---

## 로그 레벨 필터링 (Ward 대시보드에서)

Ward 대시보드의 로그 뷰어에서 키워드 검색 및 필터링을 사용할 수 있습니다.

- **에러만 보기**: `error` 또는 `[error]` 키워드로 검색
- **특정 IP 추적**: IP 주소로 검색
- **상태 코드 필터**: `" 500 "`, `" 404 "` 등으로 검색
- **서비스 필터**: `nginx-error` 서비스만 선택해서 에러 로그만 확인

---

## logrotate 환경에서의 주의사항

logrotate가 로그 파일을 교체(`rotate`)하면 Ward가 새 파일을 감지하지 못할 수 있습니다.

### 권장 설정: `copytruncate` 방식 사용

`/etc/logrotate.d/nginx` 파일에 `copytruncate` 옵션을 추가하면 파일 경로가 유지됩니다.

```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate    # 파일 교체 대신 복사 후 원본 비우기
    sharedscripts
}
```

### 또는 postrotate에서 에이전트 재시작

```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    sharedscripts
    postrotate
        systemctl reload nginx
        systemctl restart ward-agent  # 에이전트가 새 파일을 다시 감시
    endscript
}
```

> **참고**: Ward 에이전트는 inotify(Linux) 기반으로 파일 변경을 감지하므로, `copytruncate` 방식을 사용하면 로그 교체 후에도 자동으로 새 내용을 감지합니다.
