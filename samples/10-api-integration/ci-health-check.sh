#!/bin/bash
# CI/CD 파이프라인에서 배포 후 헬스 체크를 수행하는 스크립트
# 배포 대상 서버가 online인지, 지정한 서비스가 running인지 확인합니다.
# 확인 실패 시 비제로 exit code를 반환하여 파이프라인을 중단시킵니다.
#
# 사용법: ./ci-health-check.sh <server-id> <service-name> [retry-count] [retry-interval]
#
# 예시:
#   ./ci-health-check.sh srv_001 my-app
#   ./ci-health-check.sh srv_001 my-app 5 10   # 5회, 10초 간격으로 재시도
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

log_info()    { echo "[INFO]    $*"; }
log_success() { echo "[SUCCESS] $*"; }
log_warn()    { echo "[WARN]    $*"; }
log_error()   { echo "[ERROR]   $*" >&2; }

# ──────────────────────────────────────────────
# 인수 확인
# ──────────────────────────────────────────────
if [ $# -lt 2 ]; then
  echo "사용법: $0 <server-id> <service-name> [retry-count] [retry-interval]"
  echo ""
  echo "인수:"
  echo "  server-id       Ward에 등록된 서버 ID"
  echo "  service-name    확인할 서비스 이름"
  echo "  retry-count     재시도 횟수 (기본값: 5)"
  echo "  retry-interval  재시도 간격(초) (기본값: 15)"
  echo ""
  echo "예시:"
  echo "  $0 srv_001 my-app"
  echo "  $0 srv_001 my-app 10 30"
  exit 1
fi

SERVER_ID="$1"
SERVICE_NAME="$2"
MAX_RETRIES="${3:-5}"
RETRY_INTERVAL="${4:-15}"

# ──────────────────────────────────────────────
# 자격 증명 확인
# ──────────────────────────────────────────────
if [ -z "$WARD_EMAIL" ] || [ -z "$WARD_PASSWORD" ]; then
  log_error "WARD_EMAIL 과 WARD_PASSWORD 환경 변수를 설정하세요."
  exit 1
fi

echo "============================================"
echo " Ward CI/CD 헬스 체크"
echo "============================================"
echo " 서버 ID    : $SERVER_ID"
echo " 서비스     : $SERVICE_NAME"
echo " 최대 재시도: $MAX_RETRIES 회"
echo " 재시도 간격: ${RETRY_INTERVAL}초"
echo " Ward URL   : $WARD_URL"
echo "============================================"
echo ""

# ──────────────────────────────────────────────
# 로그인
# ──────────────────────────────────────────────
log_info "Ward 서버에 로그인 중..."
login_response=$(curl -s -w "\n%{http_code}" -c "$COOKIE_FILE" \
  -X POST "$WARD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WARD_EMAIL\",\"password\":\"$WARD_PASSWORD\"}")

login_code=$(echo "$login_response" | tail -n1)
if [ "$login_code" != "200" ]; then
  log_error "로그인 실패 (HTTP $login_code). WARD_EMAIL, WARD_PASSWORD를 확인하세요."
  exit 1
fi
log_info "로그인 성공"
echo ""

# ──────────────────────────────────────────────
# 헬스 체크 함수
# ──────────────────────────────────────────────
check_health() {
  local attempt="$1"
  log_info "헬스 체크 시도 ${attempt}/${MAX_RETRIES}..."

  # 서버 상태 조회
  local status_response
  status_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
    "$WARD_URL/api/servers/$SERVER_ID/status")

  local status_code
  status_code=$(echo "$status_response" | tail -n1)
  local status_body
  status_body=$(echo "$status_response" | head -n-1)

  if [ "$status_code" != "200" ]; then
    log_warn "서버 상태 조회 실패 (HTTP $status_code)"
    return 1
  fi

  if ! command -v jq &> /dev/null; then
    log_error "jq가 설치되어 있지 않습니다. 'apt install jq'로 설치하세요."
    exit 1
  fi

  # 서버 온라인 여부 확인
  local server_status
  server_status=$(echo "$status_body" | jq -r '.status // "unknown"')

  if [ "$server_status" != "online" ]; then
    log_warn "서버가 온라인 상태가 아닙니다: $server_status"
    return 1
  fi

  log_info "서버 상태: online"

  # 서비스 상태 확인
  local service_status
  service_status=$(echo "$status_body" | jq -r \
    --arg svc "$SERVICE_NAME" \
    '.services[] | select(.name == $svc) | .status' 2>/dev/null || echo "not_found")

  if [ -z "$service_status" ] || [ "$service_status" = "not_found" ]; then
    log_warn "서비스를 찾을 수 없습니다: $SERVICE_NAME"
    log_warn "등록된 서비스 목록:"
    echo "$status_body" | jq -r '.services[] | "  - \(.name) (\(.status))"'
    return 1
  fi

  log_info "서비스 '$SERVICE_NAME' 상태: $service_status"

  if [ "$service_status" = "running" ]; then
    return 0
  else
    log_warn "서비스가 실행 중이 아닙니다: $service_status"
    return 1
  fi
}

# ──────────────────────────────────────────────
# 재시도 루프
# ──────────────────────────────────────────────
for i in $(seq 1 "$MAX_RETRIES"); do
  if check_health "$i"; then
    echo ""
    log_success "헬스 체크 통과!"
    log_success "서버 '$SERVER_ID'가 online이고 서비스 '$SERVICE_NAME'이 running 상태입니다."
    exit 0
  fi

  if [ "$i" -lt "$MAX_RETRIES" ]; then
    log_warn "${RETRY_INTERVAL}초 후 재시도합니다..."
    sleep "$RETRY_INTERVAL"
  fi
done

# ──────────────────────────────────────────────
# 최대 재시도 초과 - 실패
# ──────────────────────────────────────────────
echo ""
log_error "헬스 체크 실패!"
log_error "최대 재시도 횟수(${MAX_RETRIES}회)를 초과했습니다."
log_error "서버 '$SERVER_ID' 또는 서비스 '$SERVICE_NAME'의 상태를 확인하세요."
exit 1
