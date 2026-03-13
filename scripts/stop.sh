#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.ward/ward.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Ward is not running (PID file not found)"
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Ward is not running (stale PID: $PID)"
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping Ward (PID: $PID)..."

# 에이전트 프로세스 종료 (에이전트가 Ward 서버 자식 프로세스도 종료함)
kill -TERM "$PID"

# 최대 10초 대기
for i in $(seq 1 10); do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

# 아직 살아있으면 강제 종료
if kill -0 "$PID" 2>/dev/null; then
  echo "Force killing Ward..."
  kill -KILL "$PID"
fi

rm -f "$PID_FILE"
echo "Ward stopped"
