#!/bin/bash
# Ward 서버 상태 체크 스크립트
# 모든 서버를 조회하여 offline 서버가 있으면 비제로 종료 코드를 반환합니다.
#
# 사용법: ./check-server-status.sh
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
log_warn()  { echo "[WARN]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }

# ──────────────────────────────────────────────
# 자격 증명 확인
# ──────────────────────────────────────────────
if [ -z "$WARD_EMAIL" ] || [ -z "$WARD_PASSWORD" ]; then
  log_error "WARD_EMAIL 과 WARD_PASSWORD 환경 변수를 설정하세요."
  log_error "예시: WARD_EMAIL=admin@example.com WARD_PASSWORD=secret ./check-server-status.sh"
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
# 서버 목록 조회
# ──────────────────────────────────────────────
log_info "서버 목록 조회 중..."
servers_response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
  "$WARD_URL/api/servers")

servers_code=$(echo "$servers_response" | tail -n1)
servers_body=$(echo "$servers_response" | head -n-1)

if [ "$servers_code" != "200" ]; then
  log_error "서버 목록 조회 실패 (HTTP $servers_code)"
  exit 1
fi

# ──────────────────────────────────────────────
# 상태 분석
# ──────────────────────────────────────────────
if ! command -v jq &> /dev/null; then
  log_error "jq가 설치되어 있지 않습니다. 'apt install jq' 또는 'brew install jq'로 설치하세요."
  exit 1
fi

total=$(echo "$servers_body" | jq 'length')
online=$(echo "$servers_body" | jq '[.[] | select(.status == "online")] | length')
offline=$(echo "$servers_body" | jq '[.[] | select(.status == "offline")] | length')

echo ""
echo "=== 서버 상태 요약 ==="
echo "전체: $total  |  온라인: $online  |  오프라인: $offline"
echo ""

# 온라인 서버 출력
if [ "$online" -gt 0 ]; then
  echo "[ 온라인 서버 ]"
  echo "$servers_body" | jq -r '.[] | select(.status == "online") | "  ✓ \(.name) (\(.groupName))"'
  echo ""
fi

# 오프라인 서버 출력
if [ "$offline" -gt 0 ]; then
  echo "[ 오프라인 서버 ]"
  echo "$servers_body" | jq -r '.[] | select(.status == "offline") | "  ✗ \(.name) (\(.groupName)) - 마지막 확인: \(.lastSeenAt)"'
  echo ""
  log_warn "오프라인 서버 ${offline}개가 감지되었습니다!"
  exit 1
fi

log_info "모든 서버가 정상 상태입니다."
exit 0
