import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { servicesApi } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { ServicesResponse } from '@/types';

const POLL_INTERVAL_MS = 30_000;

// 서비스 목록 페이지
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

    // 30초마다 목록 갱신
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

  const servers = data?.services ?? [];
  const totalServices = servers.reduce((sum, srv) => sum + srv.services.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">서비스</h1>
        <span className="text-sm text-gray-500">총 {totalServices}개</span>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          모니터링 중인 서비스가 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {servers.map((srv) => (
            <div key={srv.serverId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* 서버 헤더 */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <Badge status={srv.serverStatus} />
                <span className="font-medium text-gray-900">{srv.serverName}</span>
                <span className="text-xs text-gray-400">{srv.serverHostname}</span>
              </div>

              {srv.services.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">
                  등록된 서비스가 없습니다.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        서비스 소스
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        로그 수
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        마지막 로그
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {srv.services.map((svc) => (
                      <tr
                        key={svc.source}
                        onClick={() => navigate(`/servers/${srv.serverId}?tab=logs&source=${encodeURIComponent(svc.source)}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {svc.source}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {svc.logCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">
                          {svc.lastLoggedAt
                            ? new Date(svc.lastLoggedAt).toLocaleString('ko-KR')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
