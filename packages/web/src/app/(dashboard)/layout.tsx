'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// 대시보드 레이아웃 — 네비게이션 (인증은 미들웨어가 처리)
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    // 로그아웃 API 호출 후 로그인 페이지로 이동
    await fetch(`${process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000'}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 네비게이션 */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Ward
            </Link>
            <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
              서버 목록
            </Link>
            <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900">
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

      {/* 본문 */}
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
