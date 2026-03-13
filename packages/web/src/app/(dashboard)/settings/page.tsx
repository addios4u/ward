'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { serversApi, usersApi } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import type { Server, AdminUser } from '@/types';

// 설정 페이지
export default function SettingsPage() {
  // 서버 관리 상태
  const [servers, setServers] = useState<Server[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [serversError, setServersError] = useState<string | null>(null);

  // 서버 등록 모달
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerHostname, setRegisterHostname] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // API 키 표시 모달
  const [apiKeyResult, setApiKeyResult] = useState<{ serverName: string; apiKey: string } | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  // 계정 관리 상태
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  // 계정 추가 모달
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  // 비밀번호 변경 모달
  const [changePwTarget, setChangePwTarget] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState<string | null>(null);

  const fetchServers = useCallback(() => {
    serversApi
      .list()
      .then((res) => {
        setServers(res.servers);
        setServersError(null);
        setServersLoading(false);
      })
      .catch((err: Error) => {
        setServersError(err.message);
        setServersLoading(false);
      });
  }, []);

  const fetchUsers = useCallback(() => {
    usersApi
      .list()
      .then((res) => {
        setUsers(res.users);
        setUsersError(null);
        setUsersLoading(false);
      })
      .catch((err: Error) => {
        setUsersError(err.message);
        setUsersLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchServers();
    fetchUsers();
  }, [fetchServers, fetchUsers]);

  // 서버 등록
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

  // 서버 삭제
  const handleDeleteServer = async (id: string, name: string) => {
    if (!confirm(`"${name}" 서버를 삭제하시겠습니까?`)) return;
    try {
      await serversApi.delete(id);
      fetchServers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '서버 삭제 실패');
    }
  };

  // API 키 복사
  const handleCopyApiKey = () => {
    if (apiKeyResult) {
      navigator.clipboard.writeText(apiKeyResult.apiKey).then(() => {
        setApiKeyCopied(true);
        setTimeout(() => setApiKeyCopied(false), 2000);
      });
    }
  };

  // 계정 추가
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserLoading(true);
    setAddUserError(null);
    try {
      await usersApi.create(newUserEmail.trim(), newUserPassword);
      setShowAddUserModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      fetchUsers();
    } catch (err: unknown) {
      setAddUserError(err instanceof Error ? err.message : '계정 추가 실패');
    } finally {
      setAddUserLoading(false);
    }
  };

  // 계정 삭제
  const handleDeleteUser = async (id: string, email: string) => {
    if (!confirm(`"${email}" 계정을 삭제하시겠습니까?`)) return;
    try {
      await usersApi.delete(id);
      fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '계정 삭제 실패');
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePwTarget) return;
    setChangePwLoading(true);
    setChangePwError(null);
    try {
      await usersApi.changePassword(changePwTarget.id, newPassword);
      setChangePwTarget(null);
      setNewPassword('');
    } catch (err: unknown) {
      setChangePwError(err instanceof Error ? err.message : '비밀번호 변경 실패');
    } finally {
      setChangePwLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

      <div className="space-y-8 max-w-4xl">

        {/* 섹션 1: 서버 관리 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">서버 관리</h2>
              <Button size="sm" onClick={() => setShowRegisterModal(true)}>
                서버 등록
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {serversLoading ? (
              <div className="flex items-center justify-center h-24 gap-2 text-gray-400 text-sm">
                <Spinner size="sm" />
                <span>불러오는 중...</span>
              </div>
            ) : serversError ? (
              <div className="p-4">
                <ErrorMessage message={serversError} onRetry={fetchServers} />
              </div>
            ) : servers.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                등록된 서버가 없습니다.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">서버명</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">호스트명</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {servers.map((server) => (
                    <tr key={server.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{server.name}</td>
                      <td className="px-4 py-3 text-gray-600">{server.hostname}</td>
                      <td className="px-4 py-3">
                        <Badge status={server.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(server.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDeleteServer(server.id, server.name)}
                        >
                          삭제
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {/* 섹션 2: 계정 관리 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">계정 관리</h2>
              <Button size="sm" onClick={() => setShowAddUserModal(true)}>
                계정 추가
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {usersLoading ? (
              <div className="flex items-center justify-center h-24 gap-2 text-gray-400 text-sm">
                <Spinner size="sm" />
                <span>불러오는 중...</span>
              </div>
            ) : usersError ? (
              <div className="p-4">
                <ErrorMessage message={usersError} onRetry={fetchUsers} />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                등록된 계정이 없습니다.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setChangePwTarget(user);
                              setNewPassword('');
                              setChangePwError(null);
                            }}
                          >
                            비밀번호 변경
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={users.length === 1}
                            onClick={() => handleDeleteUser(user.id, user.email)}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {/* 섹션 3: 시스템 정보 */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">시스템 정보</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-500">Ward 버전</span>
                <span className="font-medium">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">서버 URL</span>
                <span className="font-mono text-xs">
                  {process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 서버 등록 모달 */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">서버 등록</h2>
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">서버명</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">호스트명</label>
                <input
                  type="text"
                  value={registerHostname}
                  onChange={(e) => setRegisterHostname(e.target.value)}
                  placeholder="예: web-server-01.example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {registerError && <p className="text-sm text-red-600">{registerError}</p>}
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
            <h2 className="text-lg font-semibold text-gray-900 mb-2">서버 등록 완료</h2>
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
              <Button onClick={() => { setApiKeyResult(null); setApiKeyCopied(false); }}>
                확인
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 추가 모달 */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">계정 추가</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {addUserError && <p className="text-sm text-red-600">{addUserError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUserEmail('');
                    setNewUserPassword('');
                    setAddUserError(null);
                  }}
                  disabled={addUserLoading}
                >
                  취소
                </Button>
                <Button type="submit" disabled={addUserLoading}>
                  {addUserLoading ? '추가 중...' : '추가'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {changePwTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">비밀번호 변경</h2>
            <p className="text-sm text-gray-500 mb-4">{changePwTarget.email}</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 입력"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {changePwError && <p className="text-sm text-red-600">{changePwError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setChangePwTarget(null);
                    setNewPassword('');
                    setChangePwError(null);
                  }}
                  disabled={changePwLoading}
                >
                  취소
                </Button>
                <Button type="submit" disabled={changePwLoading}>
                  {changePwLoading ? '변경 중...' : '변경'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
