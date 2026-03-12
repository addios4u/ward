'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getWebSocket } from '@/lib/websocket';
import type { WsMessage } from '@/types';

// WebSocket 훅
export function useWebSocket(
  onMessage?: (msg: WsMessage) => void,
  serverId?: string
) {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      // serverId가 지정된 경우 해당 서버 메시지만 처리
      if (serverId && msg.serverId !== serverId) return;
      onMessage?.(msg);
    },
    [onMessage, serverId]
  );

  useEffect(() => {
    const ws = getWebSocket();

    // 연결 시작
    ws.connect();

    // 메시지 핸들러 등록
    if (onMessage) {
      unsubscribeRef.current = ws.onMessage(handleMessage);
    }

    return () => {
      // 정리: 핸들러 해제
      unsubscribeRef.current?.();
    };
  }, [handleMessage, onMessage]);
}
