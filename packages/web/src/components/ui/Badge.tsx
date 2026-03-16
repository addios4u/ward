import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerStatus } from '@/types';

interface BadgeProps {
  status: ServerStatus;
}

// 상태별 배경색 매핑
const statusStyles: Record<ServerStatus, string> = {
  online: 'bg-green-100 text-green-800',
  offline: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};

// 서버 상태 뱃지 컴포넌트
export function Badge({ status }: BadgeProps) {
  const { t } = useTranslation();

  // 상태별 레이블
  const statusLabels: Record<ServerStatus, string> = {
    online: t('status.online'),
    offline: t('status.offline'),
    unknown: t('status.unknown'),
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
