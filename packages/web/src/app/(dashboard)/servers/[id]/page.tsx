'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { serversApi } from '@/lib/api';
import { MetricsChart } from '@/components/dashboard/MetricsChart';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useMetrics } from '@/hooks/useMetrics';
import type { ServerStatusResponse } from '@/types';

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
  const [statusData, setStatusData] = useState<ServerStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { metrics, loading: metricsLoading } = useMetrics(id);

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

  const latest = metrics[metrics.length - 1];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">
          ← 서버 목록
        </Link>
      </div>

      {statusError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          오류: {statusError}
        </div>
      )}

      {statusData && (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{statusData.server.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{statusData.server.hostname}</p>
          </div>
          <Badge status={statusData.server.status} />
        </div>
      )}

      {/* 현재 메트릭 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">로그</p>
            <Link
              href={`/servers/${id}/logs`}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              로그 보기 →
            </Link>
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
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              로딩 중...
            </div>
          ) : (
            <MetricsChart metrics={metrics} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
