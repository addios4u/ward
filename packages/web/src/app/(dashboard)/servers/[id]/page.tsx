'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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

interface ServerDetailPageProps {
  params: { id: string };
}

// 바이트를 GB로 변환
function formatGB(bytes: number | null): string {
  if (bytes === null) return '-';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// 서버 상세 페이지
export default function ServerDetailPage({ params }: ServerDetailPageProps) {
  const { id } = params;
  const [activeTab, setActiveTab] = useState<'metrics' | 'logs'>('metrics');
  const [statusData, setStatusData] = useState<ServerStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { metrics, loading: metricsLoading } = useMetrics(id);

  // 로그 탭 상태
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logLevel, setLogLevel] = useState<LogLevel | ''>('');

  const loadStatus = useCallback(() => {
    serversApi
      .getStatus(id)
      .then(setStatusData)
      .catch((err: Error) => setStatusError(err.message));
  }, [id]);

  useEffect(() => {
    loadStatus();
    // 30초마다 상태 갱신
    const timer = setInterval(loadStatus, 30000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  // 로그 불러오기
  const loadLogs = useCallback(
    (selectedLevel: LogLevel | '') => {
      setLogsLoading(true);
      serversApi
        .getLogs(id, { level: selectedLevel || undefined, limit: 100 })
        .then((res) => {
          setLogs(res.logs);
          setLogsLoading(false);
        })
        .catch((err: Error) => {
          setLogsError(err.message);
          setLogsLoading(false);
        });
    },
    [id]
  );

  // 로그 탭 활성화 시 로그 로드
  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs(logLevel);
    }
  }, [activeTab, loadLogs, logLevel]);

  // 실시간 WebSocket 로그 수신
  const handleMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === 'logs' && activeTab === 'logs') {
        const newLog = msg.data as Log;
        if (!logLevel || newLog.level === logLevel) {
          setLogs((prev) => [...prev.slice(-199), newLog]);
        }
      }
    },
    [logLevel, activeTab]
  );

  useWebSocket(handleMessage, id);

  const latest = metrics[metrics.length - 1];

  const tabActiveCls = 'text-blue-600 border-b-2 border-blue-600 font-medium';
  const tabInactiveCls = 'text-gray-500 hover:text-gray-700';

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 서버 목록
        </Link>
      </div>

      {statusError && (
        <ErrorMessage message={statusError} onRetry={loadStatus} />
      )}

      {statusData && (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{statusData.server.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{statusData.server.hostname}</p>
            {/* 공인 IP 및 위치 정보 */}
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

      {/* 현재 메트릭 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`text-sm pb-3 ${activeTab === 'metrics' ? tabActiveCls : tabInactiveCls}`}
          >
            메트릭
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`text-sm pb-3 ${activeTab === 'logs' ? tabActiveCls : tabInactiveCls}`}
          >
            로그
          </button>
        </div>
      </div>

      {/* 메트릭 탭 */}
      {activeTab === 'metrics' && (
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
      )}

      {/* 로그 탭 */}
      {activeTab === 'logs' && (
        <div className="space-y-2">
          {logsError && (
            <ErrorMessage message={logsError} onRetry={() => loadLogs(logLevel)} />
          )}
          <div className="flex justify-end">
            <button
              onClick={() => loadLogs(logLevel)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              새로고침
            </button>
          </div>
          {logsLoading ? (
            <div className="flex items-center justify-center h-48 gap-2 text-gray-400 text-sm">
              <Spinner size="sm" />
              <span>로그 불러오는 중...</span>
            </div>
          ) : (
            <div className="h-[calc(100vh-400px)] overflow-hidden">
              <LogViewer
                logs={logs}
                onLevelChange={(level) => setLogLevel(level)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
