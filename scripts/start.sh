#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.ward/ward.pid"
LOG_FILE="$ROOT_DIR/.ward/ward.log"

mkdir -p "$ROOT_DIR/.ward"

# 이미 실행 중인지 확인
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Ward is already running (PID: $PID)"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

echo "Starting Ward..."

# 백그라운드로 에이전트 시작 (에이전트가 Ward 서버 2개를 직접 시작)
nohup node "$ROOT_DIR/packages/agent/dist/start-self.js" \
  >> "$LOG_FILE" 2>&1 &

PID=$!
echo "$PID" > "$PID_FILE"

echo "Ward started (PID: $PID)"
echo "Logs: $LOG_FILE"
