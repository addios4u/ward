import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectManager } from '../../src/transport/ReconnectManager.js';
import { SendErrorType } from '../../src/transport/HttpClient.js';

describe('ReconnectManager', () => {
  let onReconnect: ReturnType<typeof vi.fn>;
  let manager: ReconnectManager;

  beforeEach(() => {
    vi.useFakeTimers();
    onReconnect = vi.fn().mockResolvedValue(undefined);
    manager = new ReconnectManager(onReconnect);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe('reportResult', () => {
    it('성공 결과 보고 시 serverAvailable이 true여야 한다', () => {
      manager.reportResult({ success: true, statusCode: 200 });

      expect(manager.serverAvailable).toBe(true);
    });

    it('CONNECTION_REFUSED 결과 보고 시 serverAvailable이 false여야 한다', () => {
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });

      expect(manager.serverAvailable).toBe(false);
    });

    it('TIMEOUT 결과 보고 시 serverAvailable이 false여야 한다', () => {
      manager.reportResult({
        success: false,
        errorType: SendErrorType.TIMEOUT,
        error: '타임아웃',
      });

      expect(manager.serverAvailable).toBe(false);
    });

    it('CONNECTION_REFUSED 보고 시 재연결 타이머가 설정되어야 한다', () => {
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });

      // 타이머 실행
      vi.runAllTimers();

      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('성공 후 재연결 타이머가 취소되어야 한다', () => {
      // 먼저 실패 보고
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });

      // 성공 보고 (타이머 취소)
      manager.reportResult({ success: true, statusCode: 200 });

      // 타이머 실행 시 onReconnect 호출 안 됨
      vi.runAllTimers();

      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('성공 보고 시 retryDelay가 리셋되어야 한다', async () => {
      // 실패 후 타이머 실행 (backoff 증가)
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });
      vi.runAllTimers();
      await vi.runAllTimersAsync();

      // 성공 보고 (backoff 리셋)
      manager.reportResult({ success: true, statusCode: 200 });

      // 다시 실패 (1000ms에서 재시작)
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });

      // 1000ms 이내에 타이머 실행
      vi.advanceTimersByTime(1000);

      expect(onReconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('destroy', () => {
    it('destroy 호출 시 타이머가 정리되어야 한다', () => {
      manager.reportResult({
        success: false,
        errorType: SendErrorType.CONNECTION_REFUSED,
        error: '연결 거부',
      });

      manager.destroy();

      // 타이머 실행해도 onReconnect 호출 안 됨
      vi.runAllTimers();

      expect(onReconnect).not.toHaveBeenCalled();
    });
  });

  describe('serverAvailable', () => {
    it('초기 상태에서 serverAvailable은 true여야 한다', () => {
      expect(manager.serverAvailable).toBe(true);
    });
  });
});
