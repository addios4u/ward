import React from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

// 에러 메시지 + 재시도 버튼 컴포넌트
export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center justify-between gap-4">
      <span className="text-sm">{t('common.error', { message })}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-900"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
