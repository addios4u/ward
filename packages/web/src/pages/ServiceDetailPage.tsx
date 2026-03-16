import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { servicesApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LogViewer } from '@/components/dashboard/LogViewer';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WardService, Log, LogLevel, WsMessage } from '@/types';

function ServiceStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-400',
    error:   'bg-red-500',
    unknown: 'bg-yellow-400',
  };
  const cls = colors[status] ?? colors['unknown'];
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />;
}

export function ServiceDetailPage() {
  const { serverId, serviceName } = useParams<{ serverId: string; serviceName: string }>();
  const decodedName = serviceName ? decodeURIComponent(serviceName) : '';

  const [service, setService] = useState<WardService | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevel | ''>();
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const fetchService = useCallback(() => {
    if (!serverId) return;
    servicesApi
      .listByServer(serverId)
      .then((res) => {
        const found = res.services.find(s => s.name === decodedName);
        if (!found) {
          setError('서비스를 찾을 수 없습니다.');
        } else {
          setService(found);
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [serverId, decodedName]);

  const fetchLogs = useCallback(() => {
    if (!serverId || !decodedName) return;
    setLogsLoading(true);
    servicesApi
      .getLogs(serverId, decodedName, {
        level: levelFilter ?? undefined,
        limit: 200,
      })
      .then((res) => {
        setLogs(res.logs);
        setLogsLoading(false);
      })
      .catch(() => setLogsLoading(false));
  }, [serverId, decodedName, levelFilter]);

  const handleRestart = async () => {
    if (!serverId || !decodedName || restarting) return;
    setRestarting(true);
    setRestartError(null);
    try {
      await servicesApi.restart(serverId, decodedName);
      setTimeout(() => {
        fetchService();
        setRestarting(false);
      }, 3000);
    } catch (err: unknown) {
      setRestartError(err instanceof Error ? err.message : '재시작 실패');
      setRestarting(false);
    }
  };

  useEffect(() => {
    fetchService();
  }, [fetchService]);

  // 초기 로드 + 60초 fallback 폴링 (WS가 주 업데이트 채널)
  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 60_000);
    return () => clearInterval(timer);
  }, [fetchLogs]);

  // WebSocket 실시간 로그 수신 (해당 서비스 source만 필터링)
  const decodedNameRef = useRef(decodedName);
  const levelFilterRef = useRef(levelFilter);
  useEffect(() => { decodedNameRef.current = decodedName; }, [decodedName]);
  useEffect(() => { levelFilterRef.current = levelFilter; }, [levelFilter]);

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'logs') {
      const newLog = msg.data as Log;
      if (newLog.source !== decodedNameRef.current) return;
      if (levelFilterRef.current && newLog.level !== levelFilterRef.current) return;
      setLogs((prev) => [...prev.slice(-199), newLog]);
    }
  }, []);

  useWebSocket(handleMessage, serverId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner size="md" />
        <span>서비스 정보 불러오는 중...</span>
      </div>
    );
  }

  if (error || !service) {
    return <ErrorMessage message={error ?? '서비스를 찾을 수 없습니다.'} onRetry={fetchService} />;
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-9.5rem)]">
      {/* 왼쪽: 서비스 정보 */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-4 pr-2">
        {/* 서비스 정보 카드 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <ServiceStatusDot status={service.status} />
              <h1 className="text-xl font-bold text-gray-900">{service.name}</h1>
              <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{service.type}</span>
              <span className="text-sm text-gray-500">{service.serverName} / {service.serverHostname}</span>
            </div>
            <button
              onClick={handleRestart}
              disabled={restarting}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                restarting
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              {restarting ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  재시작 중...
                </>
              ) : (
                <>↺ 재시작</>
              )}
            </button>
          </div>

          {restartError && (
            <p className="text-xs text-red-500 mb-3">{restartError}</p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">상태</p>
              <p className="font-medium capitalize text-gray-800">{service.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">PID</p>
              <p className="font-mono text-gray-800">{service.pid ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">재시작 횟수</p>
              <p className="text-gray-800">{service.restartCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">시작 시각</p>
              <p className="text-gray-800">{service.startedAt ? new Date(service.startedAt).toLocaleString('ko-KR') : '-'}</p>
            </div>
          </div>

          {/* CPU/메모리 (running 상태일 때만) */}
          {service.status === 'running' && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">CPU</p>
                <p className="font-mono text-gray-800">
                  {service.cpuUsage !== null ? `${service.cpuUsage.toFixed(1)}%` : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">메모리</p>
                <p className="font-mono text-gray-800">
                  {service.memUsage !== null ? `${(service.memUsage / 1024 / 1024).toFixed(1)} MB` : '-'}
                </p>
              </div>
            </div>
          )}

          {/* 명령어 / 로그 파일 */}
          {Boolean(service.config['command']) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">명령어</p>
              <p className="font-mono text-sm bg-gray-50 px-3 py-2 rounded text-gray-700">{String(service.config['command'])}</p>
            </div>
          )}
          {Boolean(service.config['paths']) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">로그 파일</p>
              <p className="font-mono text-sm bg-gray-50 px-3 py-2 rounded text-gray-700">{(service.config['paths'] as string[]).join(', ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 로그 (항상 표시) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">로그</h2>
          <div className="flex items-center gap-2">
            {logsLoading && <Spinner size="sm" />}
            <button
              onClick={fetchLogs}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <LogViewer
            logs={logs}
            onLevelChange={(level) => setLevelFilter(level)}
          />
        </div>
      </div>
    </div>
  );
}
