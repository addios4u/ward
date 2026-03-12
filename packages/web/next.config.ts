import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 환경변수 설정
  env: {
    NEXT_PUBLIC_SERVER_URL: process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000',
  },
};

export default nextConfig;
