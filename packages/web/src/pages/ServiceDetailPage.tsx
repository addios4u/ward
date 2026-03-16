import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { servicesApi } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { WardService, Log } from '@/types';

// 로그 레벨 색상
function LogLevelBadge({ level }: { level: string | null }) {
  const classes: Record<string, string> = {
    error: 'text-red-600 font-medium',
    warn:  'text-yellow-600',
    info:  'text-blue-600',
    debug: 'text-gray-400',
  };
  const cls = level ? (classes[level] ?? 'text-gray-500') : 'text-gray-400';
  return <span className={`text-xs uppercase w-10 inline-block ${cls}`}>{level ?? '-'}</span>;
}

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
  const navigate = useNavigate();
  const decodedName = serviceName ? decodeURIComponent(serviceName) : '';

  const [service, setService] = useState<WardService | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('');

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
        level: levelFilter || undefined,
        limit: 200,
      })
      .then((res) => {
        setLogs(res.logs);
        setLogsLoading(false);
      })
      .catch(() => setLogsLoading(false));
  }, [serverId, decodedName, levelFilter]);

  useEffect(() => {
    fetchService();
  }, [fetchService]);

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 10_000);
    return () => clearInterval(timer);
  }, [fetchLogs]);

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
    <div>
      {/* 뒤로가기 */}
      <button
        onClick={() => navigate('/services')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        ← 서비스 목록
      </button>

      {/* 서비스 정보 카드 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <ServiceStatusDot status={service.status} />
          <h1 className="text-xl font-bold text-gray-900">{service.name}</h1>
          <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{service.type}</span>
          <span className="text-sm text-gray-500">{service.serverName} / {service.serverHostname}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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

        {/* 명령어 또는 설정 표시 */}
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

      {/* 로그 섹션 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">로그</h2>
          <div className="flex items-center gap-2">
            {logsLoading && <Spinner size="sm" />}
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-600"
            >
              <option value="">전체</option>
              <option value="error">error</option>
              <option value="warn">warn</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">로그가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap w-40">
                      {new Date(log.loggedAt).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-2 py-1.5 w-12">
                      <LogLevelBadge level={log.level} />
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 break-all">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
