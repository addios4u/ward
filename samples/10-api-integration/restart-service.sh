#!/bin/bash
# Ward를 통해 특정 서버의 서비스를 재시작하는 스크립트
#
# 사용법: ./restart-service.sh <server-id> <service-name>
#
# 예시:
#   ./restart-service.sh srv_001 nginx
#   ./restart-service.sh srv_001 my-app
#
# 환경 변수:
#   WARD_URL       Ward 서버 URL (기본값: http://localhost:4000)
#   WARD_EMAIL     로그인 이메일
#   WARD_PASSWORD  로그인 비밀번호

set -euo pipefail

WARD_URL="${WARD_URL:-http://localhost:4000}"
WARD_EMAIL="${WARD_EMAIL:-}"
WARD_PASSWORD="${WARD_PASSWORD:-}"
COOKIE_FILE=$(mktemp /tmp/ward-cookies-XXXXXX)

trap 'rm -f "$COOKIE_FILE"' EXIT

log_info()  { echo "[INFO]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }

# ──────────────────────────────────────────────
# 인수 확인
# ──────────────────────────────────────────────
if [ $# -lt 2 ]; then
  echo "사용법: $0 <server-id> <service-name>"
  echo ""
  echo "예시:"
  echo "  $0 srv_001 nginx"
  echo "  $0 srv_001 my-app"
  echo ""
  echo "서버 ID는 'check-server-status.sh' 또는 Ward 대시보드에서 확인할 수 있습니다."
  exit 1
fi

SERVER_ID="$1"
SERVICE_NAME="$2"

# ──────────────────────────────────────────────
# 자격 증명 확인
# ──────────────────────────────────────────────
if [ -z "$WARD_EMAIL" ] || [ -z "$WARD_PASSWORD" ]; then
  log_error "WARD_EMAIL 과 WARD_PASSWORD 환경 변수를 설정하세요."
  exit 1
fi

# ──────────────────────────────────────────────
# 로그인
# ──────────────────────────────────────────────
log_info "Ward 서버에 로그인 중: $WARD_URL"
login_response=$(curl -s -w "\n%{http_code}" -c "$COOKIE_FILE" \
  -X POST "$WARD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WARD_EMAIL\",\"password\":\"$WARD_PASSWORD\"}")

login_code=$(echo "$login_response" | tail -n1)
if [ "$login_code" != "200" ]; then
  log_error "로그인 실패 (HTTP $login_code)"
  exit 1
fi
log_info "로그인 성공"

# ──────────────────────────────────────────────
# 재시작 전 서비스 상태 확인
# ──────────────────────────────────────────────
log_info "재시작 전 서버 상태 확인 중: $SERVER_ID"
status_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
  "$WARD_URL/api/servers/$SERVER_ID/status")

status_code=$(echo "$status_response" | tail -n1)
status_body=$(echo "$status_response" | head -n-1)

if [ "$status_code" != "200" ]; then
  log_error "서버 상태 조회 실패 (HTTP $status_code). 서버 ID를 확인하세요: $SERVER_ID"
  exit 1
fi

if command -v jq &> /dev/null; then
  server_name=$(echo "$status_body" | jq -r '.name // "알 수 없음"')
  server_status=$(echo "$status_body" | jq -r '.status // "알 수 없음"')
  service_status=$(echo "$status_body" | jq -r \
    --arg svc "$SERVICE_NAME" \
    '.services[] | select(.name == $svc) | .status' 2>/dev/null || echo "not found")

  log_info "서버: $server_name (상태: $server_status)"
  log_info "서비스 '$SERVICE_NAME' 현재 상태: $service_status"

  if [ "$service_status" = "not found" ]; then
    log_error "서비스를 찾을 수 없습니다: $SERVICE_NAME"
    log_error "사용 가능한 서비스 목록:"
    echo "$status_body" | jq -r '.services[] | "  - \(.name) (\(.status))"'
    exit 1
  fi
fi

# ──────────────────────────────────────────────
# 서비스 재시작
# ──────────────────────────────────────────────
log_info "서비스 재시작 요청 중: $SERVICE_NAME (서버: $SERVER_ID)"
restart_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
  -X POST "$WARD_URL/api/servers/$SERVER_ID/services/$SERVICE_NAME/restart")

restart_code=$(echo "$restart_response" | tail -n1)
restart_body=$(echo "$restart_response" | head -n-1)

if [ "$restart_code" != "200" ]; then
  log_error "서비스 재시작 실패 (HTTP $restart_code): $restart_body"
  exit 1
fi

log_info "재시작 요청 전송 완료"

# ──────────────────────────────────────────────
# 재시작 후 상태 확인 (10초 대기)
# ──────────────────────────────────────────────
log_info "서비스 시작 대기 중 (10초)..."
sleep 10

log_info "재시작 후 서비스 상태 확인 중..."
after_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
  "$WARD_URL/api/servers/$SERVER_ID/status")

after_code=$(echo "$after_response" | tail -n1)
after_body=$(echo "$after_response" | head -n-1)

if [ "$after_code" = "200" ] && command -v jq &> /dev/null; then
  new_status=$(echo "$after_body" | jq -r \
    --arg svc "$SERVICE_NAME" \
    '.services[] | select(.name == $svc) | .status' 2>/dev/null || echo "알 수 없음")
  log_info "서비스 '$SERVICE_NAME' 재시작 후 상태: $new_status"

  if [ "$new_status" = "running" ]; then
    log_info "서비스가 정상적으로 재시작되었습니다."
    exit 0
  else
    log_error "서비스 재시작 후 상태가 비정상입니다: $new_status"
    exit 1
  fi
fi

log_info "재시작 완료"
