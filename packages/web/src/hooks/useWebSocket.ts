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

    // serverId가 있으면 연결 후 채널 구독 (onopen 이후 처리)
    if (serverId) {
      const subscribeOnOpen = () => {
        ws.subscribe('metrics', serverId);
        ws.subscribe('logs', serverId);
        ws.subscribe('status', serverId);
      };

      if (ws.isConnected) {
        // 이미 연결된 경우 즉시 구독
        subscribeOnOpen();
      } else {
        // 연결 대기 후 구독 (100ms 폴링, 최대 5초)
        let attempts = 0;
        const maxAttempts = 50;
        const pollTimer = setInterval(() => {
          attempts++;
          if (ws.isConnected) {
            clearInterval(pollTimer);
            subscribeOnOpen();
          } else if (attempts >= maxAttempts) {
            clearInterval(pollTimer);
          }
        }, 100);

        return () => {
          clearInterval(pollTimer);
          unsubscribeRef.current?.();
        };
      }
    }

    return () => {
      // 정리: 핸들러 해제
      unsubscribeRef.current?.();
    };
  }, [handleMessage, onMessage, serverId]);
}
