import React from 'react';
import { useNavigate, useLocation, Link, Outlet } from 'react-router-dom';

// 대시보드 레이아웃 — 네비게이션 (인증은 App.tsx의 PrivateRoute가 처리)
export function DashboardLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    // 로그아웃 API 호출 후 로그인 페이지로 이동
    await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    navigate('/login');
  };

  // 현재 경로에 따라 active 탭 판별
  const isServers = pathname === '/' || pathname.startsWith('/servers');
  const isServices = pathname.startsWith('/services');
  const isSettings = pathname.startsWith('/settings');

  const activeCls = 'text-blue-600 border-b-2 border-blue-600 font-medium';
  const inactiveCls = 'text-gray-600 hover:text-gray-900';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 네비게이션 */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Ward
            </Link>
            <Link
              to="/"
              className={`text-sm pb-1 ${isServers ? activeCls : inactiveCls}`}
            >
              서버
            </Link>
            <Link
              to="/services"
              className={`text-sm pb-1 ${isServices ? activeCls : inactiveCls}`}
            >
              서비스
            </Link>
            <Link
              to="/settings"
              className={`text-sm pb-1 ${isSettings ? activeCls : inactiveCls}`}
            >
              설정
            </Link>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            로그아웃
          </button>
        </div>
      </nav>

      {/* 본문 — 자식 라우트 렌더링 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
