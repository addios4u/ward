import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, serversApi } from '@/lib/api';

// fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// window.location 모킹
const locationMock = { href: '' };
vi.stubGlobal('location', locationMock);

describe('authApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('로그인 성공 시 user를 반환해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 'uuid-1', email: 'admin@example.com' },
      }),
    });

    const res = await authApi.login('admin@example.com', 'password123');
    expect(res.user.email).toBe('admin@example.com');
  });

  it('로그인 실패 시 오류를 던져야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
    });

    await expect(authApi.login('wrong@example.com', 'wrong')).rejects.toThrow(
      '이메일 또는 비밀번호가 올바르지 않습니다.'
    );
  });

  it('CAPTCHA 파라미터가 포함된 로그인 요청을 전송해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 'uuid-1', email: 'admin@example.com' },
      }),
    });

    await authApi.login('admin@example.com', 'password123', {
      token: 'captcha-token-abc',
      answer: '42',
    });

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.captchaToken).toBe('captcha-token-abc');
    expect(body.captchaAnswer).toBe('42');
  });

  it('CAPTCHA 없이 로그인 요청 시 captchaToken/captchaAnswer가 없어야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 'uuid-1', email: 'admin@example.com' },
      }),
    });

    await authApi.login('admin@example.com', 'password123');

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.captchaToken).toBeUndefined();
    expect(body.captchaAnswer).toBeUndefined();
  });

  it('requireCaptcha 에러가 포함된 응답을 처리해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'CAPTCHA가 필요합니다.', requireCaptcha: true }),
    });

    await expect(authApi.login('admin@example.com', 'password123')).rejects.toMatchObject({
      message: 'CAPTCHA가 필요합니다.',
      requireCaptcha: true,
    });
  });

  it('429 응답 시 retryAfter 정보가 포함된 에러를 던져야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: '너무 많은 시도입니다.', retryAfter: 300 }),
    });

    await expect(authApi.login('admin@example.com', 'password123')).rejects.toMatchObject({
      message: '너무 많은 시도입니다.',
      retryAfter: 300,
    });
  });
});

describe('serversApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('서버 목록을 조회해야 한다', async () => {
    const mockServers = [
      { id: 'uuid-1', name: '서버 1', hostname: 'host-1', status: 'online', lastSeenAt: null, createdAt: '2024-01-01' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: mockServers }),
    });

    const res = await serversApi.list();
    expect(res.servers).toHaveLength(1);
    expect(res.servers[0].name).toBe('서버 1');
  });

  it('메트릭 조회 시 올바른 URL을 호출해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metrics: [] }),
    });

    await serversApi.getMetrics('uuid-1', 30);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/servers/uuid-1/metrics?limit=30'),
      expect.any(Object)
    );
  });

  it('로그 조회 시 레벨 필터가 적용되어야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], limit: 100, offset: 0 }),
    });

    await serversApi.getLogs('uuid-1', { level: 'error', limit: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('level=error'),
      expect.any(Object)
    );
  });
});

describe('apiFetch - credentials 및 인터셉터', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('모든 요청에 credentials: include가 포함되어야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: [] }),
    });

    await serversApi.list();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('Authorization Bearer 헤더가 없어야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: [] }),
    });

    await serversApi.list();

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBeUndefined();
  });

  it('401 응답 시 /login으로 redirect해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: '인증이 필요합니다.' }),
    });

    await serversApi.list().catch(() => {});

    expect(locationMock.href).toBe('/login');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
