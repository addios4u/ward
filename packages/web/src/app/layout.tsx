import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ward - 서버 모니터링',
  description: 'Self-hosted 서버 모니터링 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
