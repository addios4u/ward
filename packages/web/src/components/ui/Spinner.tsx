import React from 'react';
import { useTranslation } from 'react-i18next';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

// 로딩 스피너 컴포넌트
export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeStyles[size]} ${className}`}
      role="status"
      aria-label={t('spinner.loading')}
    />
  );
}
