import React from 'react';
import { Link } from 'react-router-dom';
import type { Server } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';

interface ServerCardProps {
  server: Server;
}

// 바이트를 GB로 변환
function toGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// 메트릭 프로그레스바 컴포넌트 (80% 이상이면 빨간색 경고)
function MetricBar({ value, label }: { value: number; label: string }) {
  const isWarning = value >= 80;
  const barColor = isWarning ? 'bg-red-500' : 'bg-blue-400';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className={isWarning ? 'text-red-500 font-medium' : ''}>{value.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

// 서버 카드 컴포넌트
export function ServerCard({ server }: ServerCardProps) {
  const lastSeen = server.lastSeenAt
    ? new Date(server.lastSeenAt).toLocaleString('ko-KR')
    : '없음';

  // 국가/도시 문자열 조합
  const location = [server.city, server.country].filter(Boolean).join(', ');

  // OS 정보 문자열 조합
  const osInfo = [server.osName, server.osVersion].filter(Boolean).join(' ');

  // 메모리 사용률 계산
  const memPercent =
    server.latestMetrics?.memTotal && server.latestMetrics?.memUsed
      ? (server.latestMetrics.memUsed / server.latestMetrics.memTotal) * 100
      : null;

  // 디스크 사용률 계산 (usagePercent가 가장 높은 마운트 기준)
  // — macOS: /System/Volumes/Data가 실제 데이터 볼륨이므로 / 보다 높게 나타남
  // — Linux: 가장 꽉 찬 파티션을 우선 표시
  const diskEntry = server.latestMetrics?.diskUsage
    ? Object.values(server.latestMetrics.diskUsage).reduce(
        (max, cur) => (cur.usagePercent > (max?.usagePercent ?? -1) ? cur : max),
        null as (typeof server.latestMetrics.diskUsage)[string] | null,
      )
    : null;
  const diskPercent =
    diskEntry && diskEntry.total > 0
      ? (diskEntry.used / diskEntry.total) * 100
      : null;

  return (
    <Link to={`/servers/${server.id}`}>
      <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer">
        <CardBody>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 mr-2">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{server.name}</h3>
              {/* 호스트명 표시 */}
              <p className="text-xs text-gray-400 mt-0.5 truncate">{server.hostname}</p>
              {/* OS 정보 표시 */}
              {osInfo && (
                <p className="text-xs text-gray-400 mt-0.5">{osInfo}</p>
              )}
            </div>
            <Badge status={server.status} />
          </div>

          {/* 공인 IP 및 위치 정보 */}
          <div className="mt-3 space-y-1">
            {server.publicIp && (
              <p className="text-xs text-gray-500">
                <span className="text-gray-400">IP</span>{' '}
                <span className="font-mono">{server.publicIp}</span>
              </p>
            )}
            {location && (
              <p className="text-xs text-gray-500">{location}</p>
            )}
          </div>

          {/* 최신 메트릭 표시 */}
          {server.latestMetrics && (
            <div className="mt-3 space-y-2">
              {server.latestMetrics.cpuUsage !== null && (
                <MetricBar value={server.latestMetrics.cpuUsage} label="CPU" />
              )}
              {memPercent !== null && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span>메모리</span>
                    <span className={memPercent >= 80 ? 'text-red-500 font-medium' : ''}>
                      {toGB(server.latestMetrics.memUsed!)} / {toGB(server.latestMetrics.memTotal!)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${memPercent >= 80 ? 'bg-red-500' : 'bg-blue-400'}`}
                      style={{ width: `${Math.min(memPercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {diskPercent !== null && (
                <MetricBar value={diskPercent} label="디스크" />
              )}
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            <span>마지막 확인: {lastSeen}</span>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
