'use client';

import React, { useEffect, useState } from 'react';
import { serversApi } from '@/lib/api';
import { ServerCard } from '@/components/dashboard/ServerCard';
import type { Server } from '@/types';

// 전체 서버 목록 페이지
export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    serversApi
      .list()
      .then((res) => {
        setServers(res.servers);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
        오류: {error}
      </div>
    );
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
