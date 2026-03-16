#!/bin/bash
# Ward 관리자 계정 관리 스크립트
# 사용법: ./manage-users.sh <서브커맨드> [인수...]
#
# 서브커맨드:
#   list                              - 관리자 목록 조회
#   add <email> <password>            - 관리자 계정 추가
#   delete <user-id>                  - 관리자 계정 삭제
#   change-password <user-id> <password> - 비밀번호 변경
#
# 환경 변수:
#   WARD_URL      Ward 서버 URL (기본값: http://localhost:4000)
#   WARD_EMAIL    로그인 이메일
#   WARD_PASSWORD 로그인 비밀번호

set -euo pipefail

# ──────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────
WARD_URL="${WARD_URL:-http://localhost:4000}"
WARD_EMAIL="${WARD_EMAIL:-}"
WARD_PASSWORD="${WARD_PASSWORD:-}"
COOKIE_FILE=$(mktemp /tmp/ward-cookies-XXXXXX)

# 스크립트 종료 시 쿠키 파일 삭제
trap 'rm -f "$COOKIE_FILE"' EXIT

# ──────────────────────────────────────────────
# 유틸리티 함수
# ──────────────────────────────────────────────
log_info() {
  echo "[INFO] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

# 이메일/비밀번호 입력받기
prompt_credentials() {
  if [ -z "$WARD_EMAIL" ]; then
    read -rp "Ward 이메일: " WARD_EMAIL
  fi
  if [ -z "$WARD_PASSWORD" ]; then
    read -rsp "Ward 비밀번호: " WARD_PASSWORD
    echo ""
  fi
}

# Ward 서버에 로그인
login() {
  prompt_credentials

  local response
  response=$(curl -s -w "\n%{http_code}" -c "$COOKIE_FILE" \
    -X POST "$WARD_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$WARD_EMAIL\",\"password\":\"$WARD_PASSWORD\"}")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    log_error "로그인 실패 (HTTP $http_code): $body"
    exit 1
  fi

  log_info "로그인 성공"
}

# ──────────────────────────────────────────────
# 서브커맨드: list - 관리자 목록 조회
# ──────────────────────────────────────────────
cmd_list() {
  login

  log_info "관리자 목록 조회 중..."
  local response
  response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
    "$WARD_URL/api/users")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    log_error "목록 조회 실패 (HTTP $http_code): $body"
    exit 1
  fi

  echo ""
  echo "=== 관리자 목록 ==="
  if command -v jq &> /dev/null; then
    echo "$body" | jq -r '.[] | "\(.id)\t\(.email)\t\(.createdAt)"' | \
      column -t -s $'\t' -N "ID,이메일,생성일시"
  else
    echo "$body"
  fi
}

# ──────────────────────────────────────────────
# 서브커맨드: add - 관리자 계정 추가
# ──────────────────────────────────────────────
cmd_add() {
  if [ $# -lt 2 ]; then
    log_error "사용법: $0 add <email> <password>"
    exit 1
  fi

  local email="$1"
  local password="$2"

  login

  log_info "관리자 계정 추가 중: $email"
  local response
  response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
    -X POST "$WARD_URL/api/users" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    log_error "계정 추가 실패 (HTTP $http_code): $body"
    exit 1
  fi

  log_info "계정 추가 완료"
  if command -v jq &> /dev/null; then
    echo "$body" | jq .
  else
    echo "$body"
  fi
}

# ──────────────────────────────────────────────
# 서브커맨드: delete - 관리자 계정 삭제
# ──────────────────────────────────────────────
cmd_delete() {
  if [ $# -lt 1 ]; then
    log_error "사용법: $0 delete <user-id>"
    log_error "user-id는 'list' 서브커맨드로 확인할 수 있습니다."
    exit 1
  fi

  local user_id="$1"

  login

  # 삭제 전 확인
  read -rp "정말로 사용자 '$user_id'를 삭제하시겠습니까? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    log_info "삭제를 취소했습니다."
    exit 0
  fi

  log_info "관리자 계정 삭제 중: $user_id"
  local response
  response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
    -X DELETE "$WARD_URL/api/users/$user_id")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ] && [ "$http_code" != "204" ]; then
    log_error "계정 삭제 실패 (HTTP $http_code): $body"
    exit 1
  fi

  log_info "계정 삭제 완료: $user_id"
}

# ──────────────────────────────────────────────
# 서브커맨드: change-password - 비밀번호 변경
# ──────────────────────────────────────────────
cmd_change_password() {
  if [ $# -lt 2 ]; then
    log_error "사용법: $0 change-password <user-id> <new-password>"
    exit 1
  fi

  local user_id="$1"
  local new_password="$2"

  login

  log_info "비밀번호 변경 중: $user_id"
  local response
  response=$(curl -s -w "\n%{http_code}" -b "$COOKIE_FILE" \
    -X PATCH "$WARD_URL/api/users/$user_id/password" \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"$new_password\"}")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    log_error "비밀번호 변경 실패 (HTTP $http_code): $body"
    exit 1
  fi

  log_info "비밀번호 변경 완료: $user_id"
}

# ──────────────────────────────────────────────
# 도움말
# ──────────────────────────────────────────────
usage() {
  cat <<EOF
Ward 관리자 계정 관리 스크립트

사용법: $0 <서브커맨드> [인수...]

서브커맨드:
  list                                  관리자 목록 조회
  add <email> <password>                관리자 계정 추가
  delete <user-id>                      관리자 계정 삭제
  change-password <user-id> <password>  비밀번호 변경

예시:
  $0 list
  $0 add devops@example.com mypassword123
  $0 delete usr_abc123
  $0 change-password usr_abc123 newpassword456

환경 변수:
  WARD_URL       Ward 서버 URL (기본값: http://localhost:4000)
  WARD_EMAIL     로그인 이메일 (미설정 시 입력 프롬프트)
  WARD_PASSWORD  로그인 비밀번호 (미설정 시 입력 프롬프트)

예시 (환경 변수 사용):
  WARD_URL=http://192.168.1.100:4000 \\
  WARD_EMAIL=admin@example.com \\
  WARD_PASSWORD=secret \\
  $0 list
EOF
}

# ──────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────
if [ $# -eq 0 ]; then
  usage
  exit 1
fi

SUBCOMMAND="$1"
shift

case "$SUBCOMMAND" in
  list)            cmd_list "$@" ;;
  add)             cmd_add "$@" ;;
  delete)          cmd_delete "$@" ;;
  change-password) cmd_change_password "$@" ;;
  -h|--help|help)  usage ;;
  *)
    log_error "알 수 없는 서브커맨드: $SUBCOMMAND"
    usage
    exit 1
    ;;
esac
