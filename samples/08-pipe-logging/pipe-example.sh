#!/bin/bash
# ward pipe 명령 활용 예시 스크립트
# 이 스크립트는 다양한 ward pipe 사용 패턴을 보여줍니다.

WARD_SERVER="${WARD_SERVER:-http://ward-server:4000}"

echo "Ward Pipe 예시 스크립트"
echo "서버: $WARD_SERVER"
echo ""

# ──────────────────────────────────────────────
# 예시 1: 앱 로그를 실시간으로 Ward에 전송
# ──────────────────────────────────────────────
example_app_log() {
  echo "[예시 1] 앱 로그 실시간 전송"
  tail -f /var/log/myapp/app.log | ward pipe \
    --server "$WARD_SERVER" \
    --name "myapp-log"
}

# ──────────────────────────────────────────────
# 예시 2: Node.js 앱 stdout을 Ward에 연결
# ──────────────────────────────────────────────
example_nodejs() {
  echo "[예시 2] Node.js 앱 stdout 전송"
  node /app/server.js | ward pipe \
    --server "$WARD_SERVER" \
    --name "node-app"
}

# ──────────────────────────────────────────────
# 예시 3: 에러 로그만 필터링해서 전송
# ──────────────────────────────────────────────
example_filter_errors() {
  echo "[예시 3] 에러 로그 필터링 전송"
  tail -f /var/log/syslog | grep --line-buffered -i "error\|warn\|critical" | ward pipe \
    --server "$WARD_SERVER" \
    --name "syslog-errors"
}

# ──────────────────────────────────────────────
# 예시 4: 여러 로그 파일을 하나로 합쳐서 전송
# ──────────────────────────────────────────────
example_multi_log() {
  echo "[예시 4] 여러 로그 파일 통합 전송"
  tail -f /app/logs/app1.log /app/logs/app2.log /app/logs/app3.log | ward pipe \
    --server "$WARD_SERVER" \
    --name "combined-app-logs"
}

# ──────────────────────────────────────────────
# 예시 5: 커스텀 헬스 체크 스크립트 출력 전송
# ──────────────────────────────────────────────
example_health_check() {
  echo "[예시 5] 커스텀 헬스 체크 출력 전송"
  # 10초마다 상태 체크 결과를 Ward로 전송
  while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 헬스 체크 시작"

    # DB 연결 확인
    if pg_isready -h localhost -U myapp > /dev/null 2>&1; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] DB 연결 정상"
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: DB 연결 실패"
    fi

    # 디스크 사용량 확인
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "$DISK_USAGE" -gt 90 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: 디스크 사용량 ${DISK_USAGE}% 초과"
    fi

    sleep 10
  done | ward pipe \
    --server "$WARD_SERVER" \
    --name "health-check"
}

# ──────────────────────────────────────────────
# 예시 6: journalctl과 ward pipe 조합
# ──────────────────────────────────────────────
example_journal_pipe() {
  echo "[예시 6] journalctl과 pipe 조합"
  # journal 방식 대신 pipe로 직접 journalctl 실행
  journalctl -f -u nginx.service -u postgresql.service | ward pipe \
    --server "$WARD_SERVER" \
    --name "multi-service-journal"
}

# ──────────────────────────────────────────────
# 메인: 사용 방법 출력
# ──────────────────────────────────────────────
usage() {
  cat <<EOF
사용법: $0 <예시번호>

예시:
  $0 1  - 앱 로그 실시간 전송
  $0 2  - Node.js 앱 stdout 전송
  $0 3  - 에러 로그 필터링 전송
  $0 4  - 여러 로그 파일 통합 전송
  $0 5  - 커스텀 헬스 체크 출력 전송
  $0 6  - journalctl과 pipe 조합

환경 변수:
  WARD_SERVER  Ward 서버 URL (기본값: http://ward-server:4000)

예시:
  WARD_SERVER=http://192.168.1.100:4000 $0 3
EOF
}

case "$1" in
  1) example_app_log ;;
  2) example_nodejs ;;
  3) example_filter_errors ;;
  4) example_multi_log ;;
  5) example_health_check ;;
  6) example_journal_pipe ;;
  *) usage ;;
esac
