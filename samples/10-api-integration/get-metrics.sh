#!/bin/bash
# Ward 서버 메트릭 히스토리를 JSON으로 출력하는 스크립트
#
# 사용법: ./get-metrics.sh <server-id> [limit]
#
# 예시:
#   ./get-metrics.sh srv_001         # 기본 60개 조회
#   ./get-metrics.sh srv_001 30      # 최근 30개 조회
#   ./get-metrics.sh srv_001 120     # 최근 120개 조회
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

log_info()  { echo "[INFO]  $*" >&2; }
log_error() { echo "[ERROR] $*" >&2; }

# ──────────────────────────────────────────────
# 인수 확인
# ──────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "사용법: $0 <server-id> [limit]"
  echo ""
  echo "예시:"
  echo "  $0 srv_001          # 최근 60개 메트릭 조회"
  echo "  $0 srv_001 30       # 최근 30개 메트릭 조회"
  echo "  $0 srv_001 120 | jq '.[] | .cpu'  # CPU 값만 추출"
  exit 1
fi

SERVER_ID="$1"
LIMIT="${2:-60}"

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
# 메트릭 조회
# ──────────────────────────────────────────────
log_info "메트릭 히스토리 조회 중: 서버=$SERVER_ID, limit=$LIMIT"
metrics_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
  "$WARD_URL/api/servers/$SERVER_ID/metrics?limit=$LIMIT")

metrics_code=$(echo "$metrics_response" | tail -n1)
metrics_body=$(echo "$metrics_response" | head -n-1)

if [ "$metrics_code" != "200" ]; then
  log_error "메트릭 조회 실패 (HTTP $metrics_code): $metrics_body"
  exit 1
fi

log_info "메트릭 조회 완료 (limit=$LIMIT)"

# stdout으로 JSON 출력 (파이프 연결 가능)
echo "$metrics_body"
