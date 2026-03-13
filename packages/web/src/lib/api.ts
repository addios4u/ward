// ward-server API 클라이언트
import type {
  ServersResponse,
  MetricsResponse,
  LogsResponse,
  ServerStatusResponse,
  LoginResponse,
  ServicesResponse,
  AdminUser,
} from '@/types';

// 서버 URL (환경변수로 지정 가능, 기본값은 상대 경로)
// - dev: Vite 프록시가 /api/* → localhost:4000 으로 전달
// - prod: Express가 동일 포트에서 /api/* 처리
const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? '';

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

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: '알 수 없는 오류' }));
    // 로그인 페이지에서 발생한 401은 redirect 없이 에러로 throw (CAPTCHA 등 처리 위해)
    const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
    if (res.status === 401 && !isLoginPage) {
      window.location.href = '/login';
      return undefined as unknown as T;
    }
    throw new ApiError(errorData.error ?? `HTTP 오류: ${res.status}`, {
      requireCaptcha: errorData.requireCaptcha,
      retryAfter: errorData.retryAfter ?? errorData.remainingSeconds,
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
    options: { level?: string; limit?: number; offset?: number; source?: string } = {}
  ): Promise<LogsResponse> => {
    const params = new URLSearchParams();
    if (options.level) params.set('level', options.level);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.source) params.set('source', options.source);
    const query = params.toString();
    return apiFetch<LogsResponse>(`/api/servers/${id}/logs${query ? `?${query}` : ''}`);
  },

  // 서버 삭제
  delete: (id: string): Promise<void> =>
    apiFetch(`/api/servers/${id}`, { method: 'DELETE' }),
};

// 서비스 API
export const servicesApi = {
  // 서비스 목록 조회
  list: (): Promise<ServicesResponse> => apiFetch('/api/services'),
};

// 사용자 API
export const usersApi = {
  // 관리자 계정 목록 조회
  list: (): Promise<{ users: AdminUser[] }> => apiFetch('/api/users'),

  // 관리자 계정 생성
  create: (email: string, password: string): Promise<{ user: AdminUser }> =>
    apiFetch('/api/users', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // 관리자 계정 삭제
  delete: (id: string): Promise<void> =>
    apiFetch(`/api/users/${id}`, { method: 'DELETE' }),

  // 비밀번호 변경
  changePassword: (id: string, password: string): Promise<void> =>
    apiFetch(`/api/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
};
