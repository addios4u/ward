import React, { useEffect, useState, useCallback } from 'react';
import { serversApi } from '@/lib/api';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DeleteConfirmModal } from '@/components/ui/DeleteConfirmModal';
import type { Server } from '@/types';

const POLL_INTERVAL_MS = 30_000;

function serverStatusPriority(server: Server): number {
  if (server.status === 'offline') return 0;
  if (server.status === 'unknown') return 1;
  return 2;
}

function sortServersInGroup(servers: Server[]): Server[] {
  return [...servers].sort((a, b) => {
    const sp = serverStatusPriority(a) - serverStatusPriority(b);
    if (sp !== 0) return sp;
    const aCpu = a.latestMetrics?.cpuUsage ?? 0;
    const bCpu = b.latestMetrics?.cpuUsage ?? 0;
    if (Math.abs(bCpu - aCpu) >= 5) return bCpu - aCpu;
    const aMemPct = a.latestMetrics?.memTotal ? (a.latestMetrics.memUsed ?? 0) / a.latestMetrics.memTotal * 100 : 0;
    const bMemPct = b.latestMetrics?.memTotal ? (b.latestMetrics.memUsed ?? 0) / b.latestMetrics.memTotal * 100 : 0;
    if (Math.abs(bMemPct - aMemPct) >= 5) return bMemPct - aMemPct;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

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

  const sorted = [...groupMap.entries()].sort(([aName, aServers], [bName, bServers]) => {
    // 오프라인/unknown 서버가 있는 그룹 먼저
    const aHasIssue = aServers.some(s => s.status !== 'online');
    const bHasIssue = bServers.some(s => s.status !== 'online');
    if (aHasIssue !== bHasIssue) return aHasIssue ? -1 : 1;
    // 미분류는 항상 마지막
    if (aName === '미분류') return 1;
    if (bName === '미분류') return -1;
    return aName.localeCompare(bName);
  });

  return sorted.map(([groupName, servers]) => ({ groupName, servers: sortServersInGroup(servers) }));
}

// 전체 서버 목록 페이지
export function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await serversApi.delete(deleteTarget.id);
      setServers(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeleteLoading(false);
    }
  };

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
                {groupedServers.map((server) => {
                  const isIssue = server.status !== 'online';
                  return (
                    <div key={server.id} className="relative">
                      {isIssue && (
                        <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 pointer-events-none z-10" />
                      )}
                      <ServerCard server={server} />
                      {isIssue && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setDeleteTarget({ id: server.id, name: server.name });
                          }}
                          className="absolute top-2 right-2 z-20 px-2 py-0.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded shadow"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title={`"${deleteTarget.name}" 서버를 삭제하시겠습니까?`}
          description="에이전트가 재시작되면 자동으로 재등록됩니다."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
