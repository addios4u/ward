'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { ServicesResponse } from '@/types';

const POLL_INTERVAL_MS = 30_000;

// 바이트를 MB로 변환
function formatMB(bytes: number | null): string {
  if (bytes === null) return '-';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 서비스 목록 페이지
export default function ServicesPage() {
  const router = useRouter();
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

  // 전체 프로세스 목록을 평탄화
  const rows = (data?.services ?? []).flatMap((srv) =>
    srv.processes.map((proc) => ({ ...proc, ...srv }))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">서비스</h1>
        <span className="text-sm text-gray-500">총 {rows.length}개</span>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          수집된 서비스 프로세스가 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  서비스명
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  서버
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CPU%
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  메모리
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  수집 시각
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr
                  key={`${row.serverId}-${row.pid}`}
                  onClick={() => router.push(`/services/${row.serverId}/${row.pid}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.name}
                    <span className="ml-2 text-xs text-gray-400">PID {row.pid}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-2">
                      <Badge status={row.serverStatus} />
                      <span>{row.serverName}</span>
                      <span className="text-gray-400 text-xs">{row.serverHostname}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {row.cpuUsage !== null ? `${row.cpuUsage.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatMB(row.memUsage)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {new Date(row.collectedAt).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
