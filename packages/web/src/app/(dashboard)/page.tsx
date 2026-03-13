'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { serversApi } from '@/lib/api';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { Server } from '@/types';

const POLL_INTERVAL_MS = 30_000;

// 전체 서버 목록 페이지
export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(() => {
    serversApi
      .list()
      .then((res) => {
        setServers(res.servers);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchServers();

    // 30초마다 서버 목록 갱신
    const timer = setInterval(fetchServers, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchServers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner size="md" />
        <span>서버 목록 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchServers} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">서버 목록</h1>
        <span className="text-sm text-gray-500">총 {servers.length}대</span>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          등록된 서버가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}
