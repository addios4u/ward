'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Log, LogLevel } from '@/types';

interface LogViewerProps {
  logs: Log[];
  onLevelChange?: (level: LogLevel | '') => void;
}

// 로그 레벨별 스타일
const levelStyles: Record<string, string> = {
  info: 'text-blue-600',
  warn: 'text-yellow-600',
  error: 'text-red-600',
  debug: 'text-gray-500',
};

// 로그 뷰어 컴포넌트
export function LogViewer({ logs, onLevelChange }: LogViewerProps) {
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | ''>('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  const handleLevelChange = (level: LogLevel | '') => {
    setSelectedLevel(level);
    onLevelChange?.(level);
  };

  // 새 로그 추가 시 자동 스크롤 (사용자가 위로 스크롤 중이면 중지)
  useEffect(() => {
    if (!isUserScrollingRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 사용자 스크롤 감지: 하단 근처면 자동 스크롤 재활성화
  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isUserScrollingRef.current = !isAtBottom;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 레벨 필터 */}
      <div className="flex gap-2 mb-3">
        {(['', 'info', 'warn', 'error', 'debug'] as const).map((level) => (
          <button
            key={level}
            onClick={() => handleLevelChange(level)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              selectedLevel === level
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {level === '' ? '전체' : level.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 로그 목록 */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-gray-900 rounded-lg p-4 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-4">로그가 없습니다.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 mb-1 leading-5">
              <span className="text-gray-500 shrink-0">
                {new Date(log.loggedAt).toLocaleTimeString('ko-KR')}
              </span>
              {log.source && (
                <span className="text-purple-400 shrink-0">[{log.source}]</span>
              )}
              <span
                className={`shrink-0 font-bold ${levelStyles[log.level ?? ''] ?? 'text-gray-400'}`}
              >
                {log.level?.toUpperCase() ?? 'LOG'}
              </span>
              <span className="text-gray-200 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
