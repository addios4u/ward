import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient, SendErrorType } from '../../src/transport/HttpClient.js';

// 전역 fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HttpClient({
      serverUrl: 'http://test-server:3000',
      serverId: 'test-server-id',
    });
  });

  describe('post', () => {
    it('성공적인 POST 요청을 보내야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await client.post('/api/test', { data: 'test' });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('x-ward-server-id 헤더를 포함해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await client.post('/api/test', { data: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-ward-server-id': 'test-server-id',
          }),
        })
      );
    });

    it('HTTP 오류 시 success: false를 반환해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain('401');
    });

    it('ECONNREFUSED 오류 시 CONNECTION_REFUSED errorType을 반환해야 한다', async () => {
      const connError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3000'), {
        code: 'ECONNREFUSED',
      });
      mockFetch.mockRejectedValueOnce(connError);

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(SendErrorType.CONNECTION_REFUSED);
    });

    it('ENOTFOUND 오류 시 CONNECTION_REFUSED errorType을 반환해야 한다', async () => {
      const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), {
        code: 'ENOTFOUND',
      });
      mockFetch.mockRejectedValueOnce(dnsError);

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(SendErrorType.CONNECTION_REFUSED);
    });

    it('타임아웃 시 TIMEOUT errorType을 반환해야 한다', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('타임아웃');
      expect(result.errorType).toBe(SendErrorType.TIMEOUT);
    });

    it('서버 URL 끝의 슬래시를 제거해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const clientWithTrailingSlash = new HttpClient({
        serverUrl: 'http://test-server:3000/',
        serverId: 'sid',
      });

      await clientWithTrailingSlash.post('/api/test', {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/test',
        expect.anything()
      );
    });
  });

  describe('sendMetrics', () => {
    it('/api/agent/metrics로 메트릭을 전송해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const metrics = { cpu: { usage: 50 } };
      const result = await client.sendMetrics(metrics);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/agent/metrics',
        expect.anything()
      );
    });
  });

  describe('sendHeartbeat', () => {
    it('/api/agent/heartbeat로 Heartbeat를 전송해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ ok: true, serverId: 'test-server-id', commands: [] }),
      });

      const result = await client.sendHeartbeat({ sentAt: new Date().toISOString() });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/agent/heartbeat',
        expect.anything()
      );
    });
  });

  describe('register', () => {
    it('/api/agent/register로 등록 요청을 보내고 serverId를 반환해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ serverId: 'new-server-id' }),
      });

      const result = await client.register('my-hostname', 'my-group');

      expect(result.serverId).toBe('new-server-id');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/agent/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('register 요청에는 x-ward-server-id 헤더가 없어야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ serverId: 'new-server-id' }),
      });

      await client.register('my-hostname');

      const callArgs = mockFetch.mock.calls[0];
      const headers = (callArgs?.[1] as RequestInit)?.headers as Record<string, string>;
      expect(headers?.['x-ward-server-id']).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('/api/agent/unregister로 등록 해제 요청을 보내야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await client.unregister();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/agent/unregister',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'x-ward-server-id': 'test-server-id',
          }),
        })
      );
    });

    it('unregister 실패 시 success: false를 반환해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.unregister();

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
    });
  });
});
