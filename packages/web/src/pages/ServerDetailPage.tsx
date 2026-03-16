import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { serversApi } from '@/lib/api';
import { MetricsChart } from '@/components/dashboard/MetricsChart';
import { LogViewer } from '@/components/dashboard/LogViewer';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useMetrics } from '@/hooks/useMetrics';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ServerStatusResponse, Log, LogLevel, WsMessage } from '@/types';

function formatGB(bytes: number | null): string {
  if (bytes === null) return '-';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const serverId = id!;
  const [searchParams] = useSearchParams();
  const initialSource = searchParams.get('source') ?? '';

  const [statusData, setStatusData] = useState<ServerStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { metrics, loading: metricsLoading } = useMetrics(serverId);

  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logLevel, setLogLevel] = useState<LogLevel | ''>('');
  const [logSource] = useState<string>(initialSource);

  const loadStatus = useCallback(() => {
    serversApi
      .getStatus(serverId)
      .then(setStatusData)
      .catch((err: Error) => setStatusError(err.message));
  }, [serverId]);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 30000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const loadLogs = useCallback(
    (level: LogLevel | '', source: string) => {
      setLogsLoading(true);
      serversApi
        .getLogs(serverId, {
          level: level || undefined,
          source: source || undefined,
          limit: 100,
        })
        .then((res) => {
          setLogs(res.logs);
          setLogsLoading(false);
        })
        .catch((err: Error) => {
          setLogsError(err.message);
          setLogsLoading(false);
        });
    },
    [serverId]
  );

  // 초기 로드만 수행 — 이후 실시간 업데이트는 WebSocket이 처리
  useEffect(() => {
    loadLogs(logLevel, logSource);
  }, [loadLogs, logLevel, logSource]);

  const logLevelRef = useRef(logLevel);
  const logSourceRef = useRef(logSource);
  useEffect(() => { logLevelRef.current = logLevel; }, [logLevel]);
  useEffect(() => { logSourceRef.current = logSource; }, [logSource]);

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'logs') {
      setLogs((prev) => {
        const newLog = msg.data as Log;
        if (logLevelRef.current && newLog.level !== logLevelRef.current) return prev;
        if (logSourceRef.current && newLog.source !== logSourceRef.current) return prev;
        return [...prev.slice(-199), newLog];
      });
    }
  }, []);

  useWebSocket(handleMessage, serverId);

  const latest = metrics[metrics.length - 1] ?? statusData?.latestMetric ?? null;

  return (
    <div className="flex gap-4 h-[calc(100vh-9.5rem)]">
      {/* 왼쪽: 서버 정보 + 메트릭 */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-4 pr-2">
        {statusError && <ErrorMessage message={statusError} onRetry={loadStatus} />}

        {statusData && (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{statusData.server.name}</h1>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{statusData.server.hostname}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {statusData.server.publicIp && (
                  <span className="text-xs text-gray-500">
                    <span className="text-gray-400">IP</span>{' '}
                    <span className="font-mono">{statusData.server.publicIp}</span>
                  </span>
                )}
                {(statusData.server.city ?? statusData.server.country) && (
                  <span className="text-xs text-gray-500">
                    {[statusData.server.city, statusData.server.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
            <Badge status={statusData.server.status} />
          </div>
        )}

        {/* 현재 메트릭 요약 */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">CPU 사용률</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {latest?.cpuUsage !== null && latest?.cpuUsage !== undefined
                  ? `${latest.cpuUsage.toFixed(1)}%`
                  : '-'}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">메모리 사용</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {latest ? formatGB(latest.memUsed) : '-'}
              </p>
              <p className="text-xs text-gray-400">/ {latest ? formatGB(latest.memTotal) : '-'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-gray-500">부하 평균</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {latest?.loadAvg ? latest.loadAvg[0]?.toFixed(2) : '-'}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* 메트릭 차트 */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">성능 그래프</h2>
          </CardHeader>
          <CardBody>
            {metricsLoading ? (
              <div className="h-48 flex items-center justify-center gap-2 text-gray-400 text-sm">
                <Spinner size="sm" />
                <span>메트릭 불러오는 중...</span>
              </div>
            ) : (
              <MetricsChart metrics={metrics} />
            )}
          </CardBody>
        </Card>
      </div>

      {/* 오른쪽: 로그 (항상 표시) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">로그</h2>
          <div className="flex items-center gap-2">
            {logsLoading && <Spinner size="sm" />}
            {logsError && <span className="text-xs text-red-500">{logsError}</span>}
            <button
              onClick={() => loadLogs(logLevel, logSource)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <LogViewer
            logs={logs}
            onLevelChange={(level) => setLogLevel(level)}
          />
        </div>
      </div>
    </div>
  );
}
