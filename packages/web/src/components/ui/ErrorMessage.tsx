import React from 'react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

// 에러 메시지 + 재시도 버튼 컴포넌트
export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center justify-between gap-4">
      <span className="text-sm">오류: {message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-900"
        >
          재시도
        </button>
      )}
    </div>
  );
}
