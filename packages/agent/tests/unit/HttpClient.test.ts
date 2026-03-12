import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient } from '../../src/transport/HttpClient.js';

// 전역 fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HttpClient({
      serverUrl: 'http://test-server:3000',
      apiKey: 'test-api-key',
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

    it('올바른 헤더를 포함해야 한다', async () => {
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
            Authorization: 'Bearer test-api-key',
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

    it('네트워크 오류 시 success: false를 반환해야 한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('연결 거부'));

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('연결 거부');
    });

    it('타임아웃 시 success: false를 반환해야 한다', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await client.post('/api/test', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('타임아웃');
    });

    it('서버 URL 끝의 슬래시를 제거해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const clientWithTrailingSlash = new HttpClient({
        serverUrl: 'http://test-server:3000/',
        apiKey: 'key',
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
      });

      const result = await client.sendHeartbeat({ sentAt: new Date().toISOString() });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-server:3000/api/agent/heartbeat',
        expect.anything()
      );
    });
  });
});
