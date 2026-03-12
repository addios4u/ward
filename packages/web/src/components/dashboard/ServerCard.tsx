import React from 'react';
import Link from 'next/link';
import type { Server } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';

interface ServerCardProps {
  server: Server;
}

// 바이트를 GB로 변환
function formatBytes(bytes: number | null): string {
  if (bytes === null) return '-';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// 서버 카드 컴포넌트
export function ServerCard({ server }: ServerCardProps) {
  const lastSeen = server.lastSeenAt
    ? new Date(server.lastSeenAt).toLocaleString('ko-KR')
    : '없음';

  return (
    <Link href={`/servers/${server.id}`}>
      <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer">
        <CardBody>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{server.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{server.hostname}</p>
            </div>
            <Badge status={server.status} />
          </div>
          <div className="mt-4 text-xs text-gray-400">
            <span>마지막 확인: {lastSeen}</span>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
