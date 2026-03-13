import React, { useState } from 'react';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';

// 로그인 페이지
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // CAPTCHA 상태
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // CAPTCHA 로드
  const loadCaptcha = async () => {
    const res = await fetch(`${import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000'}/api/auth/captcha`);
    const data = await res.json() as { token: string; question: string };
    setCaptchaToken(data.token);
    setCaptchaQuestion(data.question);
    setCaptchaAnswer('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await authApi.login(
        email,
        password,
        captchaRequired ? { token: captchaToken, answer: captchaAnswer } : undefined
      );
      // 전체 페이지 로드로 쿠키를 즉시 반영
      window.location.href = '/';
    } catch (err: unknown) {
      if (err instanceof Error) {
        const apiErr = err as Error & { requireCaptcha?: boolean; retryAfter?: number };
        if (apiErr.requireCaptcha) {
          setCaptchaRequired(true);
          await loadCaptcha();
        } else if (apiErr.retryAfter) {
          const minutes = Math.ceil(apiErr.retryAfter / 60);
          setError(`너무 많은 로그인 시도입니다. ${minutes}분 후에 다시 시도해주세요.`);
        } else {
          setError(err.message);
        }
      } else {
        setError('로그인에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 text-center">Ward</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            서버 모니터링 대시보드에 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {captchaRequired && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">보안 인증</p>
              <p className="text-lg font-bold text-gray-900 mb-3">{captchaQuestion}</p>
              <input
                type="number"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="답을 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={loadCaptcha}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                문제 새로 받기
              </button>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </div>
    </div>
  );
}
