import React, { useEffect, useState, useCallback } from 'react';
import { usersApi } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useTranslation } from 'react-i18next';
import type { AdminUser } from '@/types';

// 설정 페이지
export function SettingsPage() {
  const { t, i18n } = useTranslation();

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
    fetchUsers();
  }, [fetchUsers]);

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
      setAddUserError(err instanceof Error ? err.message : t('settings.addAccountError'));
    } finally {
      setAddUserLoading(false);
    }
  };

  // 계정 삭제
  const handleDeleteUser = async (id: string, email: string) => {
    if (!confirm(`"${email}" ${t('settings.delete')}?`)) return;
    try {
      await usersApi.delete(id);
      fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('settings.deleteAccountError'));
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
      setChangePwError(err instanceof Error ? err.message : t('settings.changePasswordError'));
    } finally {
      setChangePwLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('settings.title')}</h1>

      <div className="space-y-8 max-w-4xl">

        {/* 섹션 1: 계정 관리 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{t('settings.accountManagement')}</h2>
              <Button size="sm" onClick={() => setShowAddUserModal(true)}>
                {t('settings.addAccount')}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {usersLoading ? (
              <div className="flex items-center justify-center h-24 gap-2 text-gray-400 text-sm">
                <Spinner size="sm" />
                <span>{t('settings.loading')}</span>
              </div>
            ) : usersError ? (
              <div className="p-4">
                <ErrorMessage message={usersError} onRetry={fetchUsers} />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                {t('settings.noAccounts')}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('settings.colEmail')}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('settings.colCreatedAt')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
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
                            {t('settings.changePassword')}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={users.length === 1}
                            onClick={() => handleDeleteUser(user.id, user.email)}
                          >
                            {t('settings.delete')}
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

        {/* 섹션 2: 시스템 정보 */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">{t('settings.systemInfo')}</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('settings.wardVersion')}</span>
                <span className="font-medium">{__APP_VERSION__}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('settings.serverUrl')}</span>
                <span className="font-mono text-xs">
                  {import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 섹션 3: 언어 설정 */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">{t('settings.language')}</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500 mb-3">{t('settings.languageDesc')}</p>
            <div className="flex gap-2">
              {(['ko', 'en', 'ja', 'zh'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`px-4 py-2 rounded text-sm border transition-colors ${
                    i18n.language === lang
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {t(`languages.${lang}`)}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 계정 추가 모달 */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.addAccountTitle')}</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.emailLabel')}</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder={t('settings.emailPlaceholder')}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.passwordLabel')}</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder={t('settings.passwordPlaceholder')}
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
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={addUserLoading}>
                  {addUserLoading ? t('settings.adding') : t('settings.add')}
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
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.changePasswordTitle')}</h2>
            <p className="text-sm text-gray-500 mb-4">{changePwTarget.email}</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('settings.newPasswordPlaceholder')}
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
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={changePwLoading}>
                  {changePwLoading ? t('settings.changing') : t('settings.change')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
