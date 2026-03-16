import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { servicesApi } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { ServicesResponse, WardService } from '@/types';

const POLL_INTERVAL_MS = 30_000;

function ServiceStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-gray-100 text-gray-600',
    error:   'bg-red-100 text-red-700',
    unknown: 'bg-yellow-100 text-yellow-700',
  };
  const cls = classes[status] ?? classes['unknown'];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ServiceTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 font-mono">
      {type}
    </span>
  );
}

function formatUptime(startedAt: string | null): string {
  if (!startedAt) return '-';
  return new Date(startedAt).toLocaleString('ko-KR');
}

export function ServicesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(() => {
    servicesApi
      .list()
      .then((res) => {
        setData(res);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchServices();
    const timer = setInterval(fetchServices, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchServices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner size="md" />
        <span>서비스 목록 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchServices} />;
  }

  const services = data?.services ?? [];

  // 서버별 그룹화
  const grouped = services.reduce<Record<string, { serverName: string; serverHostname: string; serverStatus: string; services: WardService[] }>>((acc, svc) => {
    if (!acc[svc.serverId]) {
      acc[svc.serverId] = {
        serverName: svc.serverName,
        serverHostname: svc.serverHostname,
        serverStatus: svc.serverStatus,
        services: [],
      };
    }
    acc[svc.serverId]!.services.push(svc);
    return acc;
  }, {});

  const groupEntries = Object.entries(grouped);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">서비스</h1>
        <span className="text-sm text-gray-500">총 {services.length}개 서비스</span>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">등록된 서비스가 없습니다.</p>
          <p className="text-sm font-mono bg-gray-50 inline-block px-4 py-2 rounded mt-2">
            ward service add &lt;이름&gt; --exec "명령어"
          </p>
          <p className="text-xs mt-3 text-gray-400">에이전트가 설치된 서버에서 위 명령어로 서비스를 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupEntries.map(([serverId, group]) => (
            <div
              key={serverId}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              <div
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                onClick={() => navigate(`/servers/${serverId}`)}
              >
                <Badge status={group.serverStatus as any} />
                <span className="font-medium text-gray-900">{group.serverName}</span>
                <span className="text-xs text-gray-400">{group.serverHostname}</span>
              </div>

              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">서비스명</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">타입</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">PID</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">재시작</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">시작 시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.services.map((svc) => (
                    <tr
                      key={svc.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/services/${svc.serverId}/${encodeURIComponent(svc.name)}`)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{svc.name}</td>
                      <td className="px-4 py-3"><ServiceTypeBadge type={svc.type} /></td>
                      <td className="px-4 py-3"><ServiceStatusBadge status={svc.status} /></td>
                      <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">{svc.pid ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{svc.restartCount}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatUptime(svc.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
