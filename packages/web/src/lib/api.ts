// ward-server API 클라이언트
import type {
  ServersResponse,
  MetricsResponse,
  LogsResponse,
  ServerStatusResponse,
  LoginResponse,
} from '@/types';

// 서버 URL (환경변수에서 읽음)
const SERVER_URL =
  typeof window !== 'undefined'
    ? (process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000')
    : (process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:4000');

// 추가 에러 정보를 포함하는 커스텀 에러 클래스
class ApiError extends Error {
  requireCaptcha?: boolean;
  retryAfter?: number;

  constructor(message: string, options?: { requireCaptcha?: boolean; retryAfter?: number }) {
    super(message);
    this.name = 'ApiError';
    this.requireCaptcha = options?.requireCaptcha;
    this.retryAfter = options?.retryAfter;
  }
}

// 기본 fetch 래퍼 (쿠키 기반 인증)
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // 401 응답 시 로그인 페이지로 리다이렉트
  if (res.status === 401) {
    window.location.href = '/login';
    return undefined as unknown as T;
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: '알 수 없는 오류' }));
    throw new ApiError(errorData.error ?? `HTTP 오류: ${res.status}`, {
      requireCaptcha: errorData.requireCaptcha,
      retryAfter: errorData.retryAfter,
    });
  }

  return res.json() as Promise<T>;
}

// 인증 API
export const authApi = {
  // 로그인
  login: (
    email: string,
    password: string,
    captcha?: { token: string; answer: string }
  ): Promise<LoginResponse> =>
    apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        ...(captcha ? { captchaToken: captcha.token, captchaAnswer: captcha.answer } : {}),
      }),
    }),
};

// 서버 API
export const serversApi = {
  // 서버 목록 조회
  list: (): Promise<ServersResponse> => apiFetch<ServersResponse>('/api/servers'),

  // 서버 메트릭 히스토리 조회
  getMetrics: (id: string, limit = 60): Promise<MetricsResponse> =>
    apiFetch<MetricsResponse>(`/api/servers/${id}/metrics?limit=${limit}`),

  // 서버 최신 상태 조회
  getStatus: (id: string): Promise<ServerStatusResponse> =>
    apiFetch<ServerStatusResponse>(`/api/servers/${id}/status`),

  // 서버 로그 조회
  getLogs: (
    id: string,
    options: { level?: string; limit?: number; offset?: number } = {}
  ): Promise<LogsResponse> => {
    const params = new URLSearchParams();
    if (options.level) params.set('level', options.level);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return apiFetch<LogsResponse>(`/api/servers/${id}/logs${query ? `?${query}` : ''}`);
  },
};
