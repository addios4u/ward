'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { serversApi } from '@/lib/api';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { Server } from '@/types';

const POLL_INTERVAL_MS = 30_000;

// 서버를 그룹별로 묶어 반환 (groupName null → "미분류")
function groupServers(servers: Server[]): { groupName: string; servers: Server[] }[] {
  const groupMap = new Map<string, Server[]>();

  for (const server of servers) {
    const key = server.groupName ?? '미분류';
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(server);
  }

  // 그룹 이름 정렬: 미분류는 항상 마지막
  const sorted = [...groupMap.entries()].sort(([a], [b]) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    return a.localeCompare(b);
  });

  return sorted.map(([groupName, servers]) => ({ groupName, servers }));
}

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

  const groups = groupServers(servers);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">서버 목록</h1>
        <span className="text-sm text-gray-500">총 {servers.length}대</span>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        서버에 ward 에이전트를 설치하면 자동으로 이곳에 나타납니다.
      </p>

      {servers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          등록된 서버가 없습니다.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ groupName, servers: groupedServers }) => (
            <div key={groupName}>
              {/* 그룹 헤더 */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  {groupName}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">{groupedServers.length}대</span>
              </div>
              {/* 그룹 내 서버 카드 목록 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedServers.map((server) => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
