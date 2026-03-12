'use client';

import { useState, useEffect, useCallback } from 'react';
import { serversApi } from '@/lib/api';
import type { Metric, WsMessage } from '@/types';
import { useWebSocket } from './useWebSocket';

// 메트릭 훅 — 초기 히스토리 + 실시간 WebSocket 업데이트
export function useMetrics(serverId: string) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초기 히스토리 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    serversApi
      .getMetrics(serverId)
      .then((res) => {
        if (!cancelled) {
          setMetrics(res.metrics);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  // 실시간 WebSocket 메트릭 수신
  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'metrics') {
      setMetrics((prev) => {
        const newMetric = msg.data as Metric;
        // 최대 60개 유지
        return [...prev.slice(-59), newMetric];
      });
    }
  }, []);

  useWebSocket(handleMessage, serverId);

  return { metrics, loading, error };
}
