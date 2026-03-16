import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, serversApi, servicesApi, usersApi } from '@/lib/api';

// fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// window.location 모킹
const locationMock = { href: '' };
vi.stubGlobal('location', locationMock);

// 테스트용 서버 목 데이터 (새 필드 포함)
const mockServerBase = {
  id: 'uuid-1',
  name: '서버 1',
  hostname: 'host-1',
  groupName: null,
  publicIp: null,
  country: null,
  city: null,
  isp: null,
  status: 'online' as const,
  lastSeenAt: null,
  createdAt: '2024-01-01',
  osName: null,
  osVersion: null,
  arch: null,
  latestMetrics: null,
};

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
    const mockServers = [mockServerBase];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: mockServers }),
    });

    const res = await serversApi.list();
    expect(res.servers).toHaveLength(1);
    expect(res.servers[0].name).toBe('서버 1');
  });

  it('서버 목록 응답에 groupName, publicIp, country, city, isp 필드가 포함되어야 한다', async () => {
    const mockServers = [
      {
        ...mockServerBase,
        groupName: 'Production',
        publicIp: '1.2.3.4',
        country: 'South Korea',
        city: 'Seoul',
        isp: 'KT',
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: mockServers }),
    });

    const res = await serversApi.list();
    expect(res.servers[0].groupName).toBe('Production');
    expect(res.servers[0].publicIp).toBe('1.2.3.4');
    expect(res.servers[0].country).toBe('South Korea');
    expect(res.servers[0].city).toBe('Seoul');
    expect(res.servers[0].isp).toBe('KT');
  });

  it('groupName이 null인 서버도 목록에 포함되어야 한다', async () => {
    const mockServers = [{ ...mockServerBase, groupName: null }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: mockServers }),
    });

    const res = await serversApi.list();
    expect(res.servers[0].groupName).toBeNull();
  });

  it('서버 목록 응답에 latestMetrics 필드가 포함되어야 한다', async () => {
    const mockServers = [
      {
        ...mockServerBase,
        osName: 'Ubuntu',
        osVersion: '22.04',
        arch: 'x86_64',
        latestMetrics: {
          cpuUsage: 45.2,
          memTotal: 8589934592,
          memUsed: 4294967296,
          diskUsage: { '/': { total: 107374182400, used: 53687091200, free: 53687091200 } },
          loadAvg: [1.5, 1.2, 0.9],
        },
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ servers: mockServers }),
    });

    const res = await serversApi.list();
    expect(res.servers[0].osName).toBe('Ubuntu');
    expect(res.servers[0].latestMetrics?.cpuUsage).toBe(45.2);
    expect(res.servers[0].latestMetrics?.memTotal).toBe(8589934592);
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

describe('serversApi - 삭제', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('서버 삭제 시 DELETE /api/servers/:id를 호출해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await serversApi.delete('uuid-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/servers/uuid-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('로그 조회 시 source 파라미터가 적용되어야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], limit: 100, offset: 0 }),
    });

    await serversApi.getLogs('uuid-1', { source: 'app', limit: 100 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('source=app'),
      expect.any(Object)
    );
  });
});

describe('servicesApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('서비스 목록을 조회해야 한다', async () => {
    const mockServices = [
      {
        serverId: 'uuid-1',
        serverName: '웹 서버',
        serverHostname: 'web.example.com',
        serverStatus: 'online',
        processes: [
          { pid: 1234, name: 'node', cpuUsage: 2.5, memUsage: 104857600, collectedAt: '2024-01-01T00:00:00Z' },
        ],
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ services: mockServices }),
    });

    const res = await servicesApi.list();
    expect(res.services).toHaveLength(1);
    expect(res.services[0].serverName).toBe('웹 서버');
    expect(res.services[0].processes[0].pid).toBe(1234);
  });

  it('GET /api/services를 호출해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ services: [] }),
    });

    await servicesApi.list();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/services'),
      expect.any(Object)
    );
  });
});

describe('usersApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    locationMock.href = '';
  });

  it('계정 목록을 조회해야 한다', async () => {
    const mockUsers = [{ id: 'u1', email: 'admin@example.com', createdAt: '2024-01-01' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: mockUsers }),
    });

    const res = await usersApi.list();
    expect(res.users).toHaveLength(1);
    expect(res.users[0].email).toBe('admin@example.com');
  });

  it('계정 생성 시 POST /api/users를 호출해야 한다', async () => {
    const mockUser = { id: 'u2', email: 'new@example.com', createdAt: '2024-01-01' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUser }),
    });

    const res = await usersApi.create('new@example.com', 'password123');
    expect(res.user.email).toBe('new@example.com');

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body.email).toBe('new@example.com');
  });

  it('계정 삭제 시 DELETE /api/users/:id를 호출해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await usersApi.delete('u1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/u1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('비밀번호 변경 시 PATCH /api/users/:id/password를 호출해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await usersApi.changePassword('u1', 'newpassword');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/u1/password'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
