import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { servicesApi } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { DeleteConfirmModal } from '@/components/ui/DeleteConfirmModal';
import { useTranslation } from 'react-i18next';
import type { ServicesResponse, WardService } from '@/types';

const POLL_INTERVAL_MS = 30_000;

function serviceStatusPriority(status: string): number {
  if (status === 'error') return 0;
  if (status === 'stopped') return 1;
  if (status === 'unknown') return 2;
  return 3; // running
}

function sortServices(services: WardService[]): WardService[] {
  return [...services].sort((a, b) => {
    const sp = serviceStatusPriority(a.status) - serviceStatusPriority(b.status);
    if (sp !== 0) return sp;
    const cpuDiff = (b.cpuUsage ?? 0) - (a.cpuUsage ?? 0);
    if (Math.abs(cpuDiff) >= 5) return cpuDiff;
    const memDiff = (b.memUsage ?? 0) - (a.memUsage ?? 0);
    if (Math.abs(memDiff) >= 5) return memDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

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
  return new Date(startedAt).toLocaleString();
}

export function ServicesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ serverId: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await servicesApi.delete(deleteTarget.serverId, deleteTarget.name);
      setData(prev => prev ? {
        ...prev,
        services: prev.services.filter(s => !(s.serverId === deleteTarget.serverId && s.name === deleteTarget.name)),
      } : prev);
      setDeleteTarget(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('services.deleteErrorMessage'));
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const timer = setInterval(fetchServices, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchServices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
        <Spinner size="md" />
        <span>{t('services.loadingMessage')}</span>
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

  const groupEntries = Object.entries(grouped).sort(([, a], [, b]) => {
    const aHasIssue = a.services.some(s => s.status !== 'running');
    const bHasIssue = b.services.some(s => s.status !== 'running');
    if (aHasIssue !== bHasIssue) return aHasIssue ? -1 : 1;
    return 0;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('services.title')}</h1>
        <span className="text-sm text-gray-500">{t('services.count', { count: services.length })}</span>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">{t('services.emptyTitle')}</p>
          <p className="text-sm font-mono bg-gray-50 inline-block px-4 py-2 rounded mt-2">
            ward service add &lt;이름&gt; --exec "명령어"
          </p>
          <p className="text-xs mt-3 text-gray-400">{t('services.emptyDesc')}</p>
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
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colName')}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colType')}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colStatus')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colPid')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colRestarts')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colCpu')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colMemory')}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('services.colStartedAt')}</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortServices(group.services).map((svc) => {
                    const isIssue = svc.status !== 'running';
                    const rowBg = svc.status === 'error'
                      ? 'bg-red-50 hover:bg-red-100'
                      : svc.status === 'stopped'
                      ? 'bg-gray-50 hover:bg-gray-100'
                      : svc.status === 'unknown'
                      ? 'bg-yellow-50 hover:bg-yellow-100'
                      : 'hover:bg-gray-50';
                    return (
                      <tr
                        key={svc.id}
                        className={`cursor-pointer ${rowBg}`}
                        onClick={() => navigate(`/services/${svc.serverId}/${encodeURIComponent(svc.name)}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{svc.name}</td>
                        <td className="px-4 py-3"><ServiceTypeBadge type={svc.type} /></td>
                        <td className="px-4 py-3"><ServiceStatusBadge status={svc.status} /></td>
                        <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">{svc.pid ?? '-'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{svc.restartCount}</td>
                        <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                          {svc.cpuUsage !== null ? `${svc.cpuUsage.toFixed(1)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                          {svc.memUsage !== null ? `${(svc.memUsage / 1024 / 1024).toFixed(1)} MB` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatUptime(svc.startedAt)}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {isIssue && (
                            <button
                              onClick={() => setDeleteTarget({ serverId: svc.serverId, name: svc.name })}
                              className="px-2 py-0.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title={`"${deleteTarget.name}" ${t('common.delete')}?`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
