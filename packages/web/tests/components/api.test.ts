import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, serversApi, saveToken, removeToken } from '@/lib/api';

// fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// localStorage 모킹
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

describe('authApi', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockFetch.mockReset();
  });

  it('로그인 성공 시 token과 user를 반환해야 한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'test-jwt-token',
        user: { id: 'uuid-1', email: 'admin@example.com' },
      }),
    });

    const res = await authApi.login('admin@example.com', 'password123');

    expect(res.token).toBe('test-jwt-token');
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
});

describe('serversApi', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockFetch.mockReset();
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

describe('토큰 관리', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('saveToken이 localStorage에 토큰을 저장해야 한다', () => {
    saveToken('test-token');
    expect(localStorageMock.getItem('ward_token')).toBe('test-token');
  });

  it('removeToken이 localStorage에서 토큰을 삭제해야 한다', () => {
    localStorageMock.setItem('ward_token', 'test-token');
    removeToken();
    expect(localStorageMock.getItem('ward_token')).toBeNull();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
