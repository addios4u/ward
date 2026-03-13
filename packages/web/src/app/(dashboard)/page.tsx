'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { serversApi } from '@/lib/api';
import { ServerCard } from '@/components/dashboard/ServerCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Button } from '@/components/ui/Button';
import type { Server } from '@/types';

const POLL_INTERVAL_MS = 30_000;

// 전체 서버 목록 페이지
export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 서버 등록 모달 상태
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerHostname, setRegisterHostname] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // API 키 표시 모달 상태
  const [apiKeyResult, setApiKeyResult] = useState<{ serverName: string; apiKey: string } | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

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

  // 서버 등록 제출
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      const res = await serversApi.register(registerName.trim(), registerHostname.trim());
      setShowRegisterModal(false);
      setRegisterName('');
      setRegisterHostname('');
      setApiKeyResult({ serverName: res.server.name, apiKey: res.apiKey });
      fetchServers();
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : '서버 등록 실패');
    } finally {
      setRegisterLoading(false);
    }
  };

  // API 키 클립보드 복사
  const handleCopyApiKey = () => {
    if (apiKeyResult) {
      navigator.clipboard.writeText(apiKeyResult.apiKey).then(() => {
        setApiKeyCopied(true);
        setTimeout(() => setApiKeyCopied(false), 2000);
      });
    }
  };

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">서버 목록</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">총 {servers.length}대</span>
          <Button size="sm" onClick={() => setShowRegisterModal(true)}>
            서버 등록
          </Button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          등록된 서버가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}

      {/* 서버 등록 모달 */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">서버 등록</h2>
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  서버명
                </label>
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  placeholder="예: 웹 서버 1"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  호스트명
                </label>
                <input
                  type="text"
                  value={registerHostname}
                  onChange={(e) => setRegisterHostname(e.target.value)}
                  placeholder="예: web-server-01.example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {registerError && (
                <p className="text-sm text-red-600">{registerError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowRegisterModal(false);
                    setRegisterName('');
                    setRegisterHostname('');
                    setRegisterError(null);
                  }}
                  disabled={registerLoading}
                >
                  취소
                </Button>
                <Button type="submit" disabled={registerLoading}>
                  {registerLoading ? '등록 중...' : '등록'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API 키 표시 모달 */}
      {apiKeyResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              서버 등록 완료
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{apiKeyResult.serverName}</span> 서버가 등록되었습니다.
              아래 API 키를 에이전트 설정에 사용하세요.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <p className="text-xs text-yellow-800 font-medium mb-2">
                ⚠ 이 키는 다시 확인할 수 없습니다. 지금 반드시 복사하세요.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1 break-all font-mono">
                  {apiKeyResult.apiKey}
                </code>
                <Button size="sm" variant="secondary" onClick={handleCopyApiKey}>
                  {apiKeyCopied ? '복사됨' : '복사'}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setApiKeyResult(null);
                  setApiKeyCopied(false);
                }}
              >
                확인
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
