import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { ServersPage } from './pages/ServersPage';
import { ServerDetailPage } from './pages/ServerDetailPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

// /api/auth/me로 인증 상태 확인 (httpOnly 쿠키 지원)
async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

// 인증 필요 라우트 래퍼
function PrivateRoute({ auth, children }: { auth: AuthState; children: React.ReactNode }) {
  if (auth === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }
  if (auth === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    checkAuth().then(ok => setAuth(ok ? 'authenticated' : 'unauthenticated'));
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={
          auth === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />
        } />
        <Route
          path="/"
          element={
            <PrivateRoute auth={auth}>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<ServersPage />} />
          <Route path="servers/:id" element={<ServerDetailPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
