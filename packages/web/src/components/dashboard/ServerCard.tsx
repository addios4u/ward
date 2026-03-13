import React from 'react';
import Link from 'next/link';
import type { Server } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';

interface ServerCardProps {
  server: Server;
}

// 서버 카드 컴포넌트
export function ServerCard({ server }: ServerCardProps) {
  const lastSeen = server.lastSeenAt
    ? new Date(server.lastSeenAt).toLocaleString('ko-KR')
    : '없음';

  // 국가/도시 문자열 조합
  const location = [server.city, server.country].filter(Boolean).join(', ');

  return (
    <Link href={`/servers/${server.id}`}>
      <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer">
        <CardBody>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 mr-2">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{server.name}</h3>
              {/* 호스트명 표시 */}
              <p className="text-xs text-gray-400 mt-0.5 truncate">{server.hostname}</p>
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

          <div className="mt-3 text-xs text-gray-400">
            <span>마지막 확인: {lastSeen}</span>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
