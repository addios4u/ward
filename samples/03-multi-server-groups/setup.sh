#!/bin/bash
# Ward 에이전트 그룹별 설정 스크립트
#
# 사용법: ./setup.sh <그룹명> <서버URL>
# 예시:   ./setup.sh production http://ward-server:4000
#         ./setup.sh staging    http://ward-server:4000
#         ./setup.sh development http://ward-server:4000

set -e

GROUP_NAME="$1"
SERVER_URL="$2"

# 인자 유효성 검사
if [ -z "$GROUP_NAME" ] || [ -z "$SERVER_URL" ]; then
  echo "사용법: $0 <그룹명> <서버URL>"
  echo "예시:   $0 production http://ward-server:4000"
  exit 1
fi

# 허용된 그룹명 확인
case "$GROUP_NAME" in
  production|staging|development)
    ;;
  *)
    echo "경고: '$GROUP_NAME'은 표준 그룹명이 아닙니다. (표준: production, staging, development)"
    echo "계속 진행하려면 Enter를 누르세요. 취소하려면 Ctrl+C를 누르세요."
    read -r
    ;;
esac

echo "=== Ward 에이전트 설정 ==="
echo "그룹명:    $GROUP_NAME"
echo "서버 URL:  $SERVER_URL"
echo ""

# ward CLI가 설치되어 있는지 확인
if ! command -v ward &> /dev/null; then
  echo "오류: ward CLI가 설치되어 있지 않습니다."
  echo "설치 명령: npm install -g @ward/agent"
  exit 1
fi

# 실행 중인 에이전트가 있으면 중지
if ward status &> /dev/null; then
  echo "기존 에이전트를 중지합니다..."
  ward stop || true
fi

# 에이전트 시작
echo "Ward 에이전트를 시작합니다..."
ward start "$SERVER_URL" --name "$GROUP_NAME"

echo ""
echo "=== 설정 완료 ==="
echo "에이전트가 '$GROUP_NAME' 그룹으로 $SERVER_URL 에 연결되었습니다."
echo ""
echo "상태 확인: ward status"
echo "에이전트 중지: ward stop"
