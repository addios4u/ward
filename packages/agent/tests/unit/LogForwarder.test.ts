import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogForwarder } from '../../src/logs/LogForwarder.js';
import { HttpClient } from '../../src/transport/HttpClient.js';

// HttpClient 모킹
vi.mock('../../src/transport/HttpClient.js', () => {
  return {
    HttpClient: vi.fn().mockImplementation(() => ({
      post: vi.fn().mockResolvedValue({ success: true, statusCode: 201 }),
      sendMetrics: vi.fn(),
      sendHeartbeat: vi.fn(),
    })),
  };
});

describe('LogForwarder', () => {
  let forwarder: LogForwarder;
  let mockClient: { post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockClient = {
      post: vi.fn().mockResolvedValue({ success: true, statusCode: 201 }),
    };

    forwarder = new LogForwarder({
      client: mockClient as unknown as HttpClient,
      batchSize: 100,
      flushIntervalMs: 5000,
    });
  });

  afterEach(async () => {
    await forwarder.stop();
    vi.useRealTimers();
  });

  describe('addLog', () => {
    it('로그를 버퍼에 추가해야 한다', () => {
      forwarder.addLog('nginx', 'GET /index.html 200');
      expect(forwarder.bufferSize).toBe(1);
    });

    it('기본 level은 info여야 한다', async () => {
      forwarder.addLog('nginx', 'GET /index.html 200');

      // 강제 플러시
      await forwarder.stop();

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/agent/logs',
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({
              source: 'nginx',
              level: 'info',
              message: 'GET /index.html 200',
            }),
          ]),
        })
      );
    });

    it('배치 크기(100)에 도달하면 즉시 전송해야 한다', async () => {
      const smallForwarder = new LogForwarder({
        client: mockClient as unknown as HttpClient,
        batchSize: 3,
        flushIntervalMs: 5000,
      });

      smallForwarder.addLog('app', '라인 1');
      smallForwarder.addLog('app', '라인 2');
      smallForwarder.addLog('app', '라인 3'); // 배치 크기 도달

      // 비동기 전송 완료 대기
      await Promise.resolve();
      await Promise.resolve();

      expect(mockClient.post).toHaveBeenCalled();
      await smallForwarder.stop();
    });

    it('level을 지정할 수 있어야 한다', async () => {
      forwarder.addLog('app', '에러 발생', 'error');
      await forwarder.stop();

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/agent/logs',
        expect.objectContaining({
          logs: expect.arrayContaining([
            expect.objectContaining({ level: 'error' }),
          ]),
        })
      );
    });
  });

  describe('start / stop', () => {
    it('start 후 flushIntervalMs마다 전송해야 한다', async () => {
      forwarder.start();
      forwarder.addLog('nginx', '라인 1');

      // 5초 경과 시뮬레이션
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();

      expect(mockClient.post).toHaveBeenCalled();
    });

    it('stop 시 남은 버퍼를 전송해야 한다', async () => {
      forwarder.addLog('nginx', '전송 안 된 로그');
      expect(forwarder.bufferSize).toBe(1);

      await forwarder.stop();

      expect(mockClient.post).toHaveBeenCalled();
      expect(forwarder.bufferSize).toBe(0);
    });

    it('버퍼가 비어있으면 전송하지 않아야 한다', async () => {
      await forwarder.stop();
      expect(mockClient.post).not.toHaveBeenCalled();
    });
  });

  describe('전송 실패 처리', () => {
    it('전송 실패 시 큐에 버퍼링해야 한다', async () => {
      mockClient.post.mockResolvedValueOnce({ success: false, error: '서버 연결 실패' });

      forwarder.addLog('app', '중요한 로그');
      await forwarder.stop();

      // 큐에 저장 후 재시도 — post가 한 번은 호출되어야 함
      expect(mockClient.post).toHaveBeenCalledTimes(1);
    });

    it('재시도 시 큐에 쌓인 항목을 먼저 전송해야 한다', async () => {
      // 첫 번째 전송 실패
      mockClient.post
        .mockResolvedValueOnce({ success: false, error: '실패' }) // 큐 재시도
        .mockResolvedValueOnce({ success: true, statusCode: 201 });  // 새 배치

      const failForwarder = new LogForwarder({
        client: mockClient as unknown as HttpClient,
        batchSize: 1,
        flushIntervalMs: 5000,
      });

      failForwarder.addLog('app', '첫 번째 로그');
      await Promise.resolve();
      await Promise.resolve();

      // 두 번째 로그 추가 → 플러시 시 큐 재시도 후 새 배치 전송
      failForwarder.addLog('app', '두 번째 로그');
      await Promise.resolve();
      await Promise.resolve();

      await failForwarder.stop();
    });
  });
});
