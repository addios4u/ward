'use client';

import React from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';

// 설정 페이지
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">서버 연결 설정</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  서버 URL
                </label>
                <input
                  type="text"
                  readOnly
                  value={process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  환경변수 NEXT_PUBLIC_SERVER_URL로 설정됩니다.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">정보</h2>
          </CardHeader>
          <CardBody>
            <div className="text-sm text-gray-600 space-y-2">
              <p>Ward - Self-hosted 서버 모니터링 시스템</p>
              <p className="text-xs text-gray-400">버전 0.1.0</p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
