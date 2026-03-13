import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IpCollector } from '../../src/metrics/IpCollector.js';

// 전역 fetch 모킹
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('IpCollector', () => {
  let collector: IpCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new IpCollector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('collect', () => {
    it('ip-api.com 응답 성공 시 IpInfo를 반환해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          status: 'success',
          query: '1.2.3.4',
          country: 'South Korea',
          city: 'Seoul',
          isp: 'KT',
        }),
      });

      const result = await collector.collect();

      expect(result).not.toBeNull();
      expect(result?.ip).toBe('1.2.3.4');
      expect(result?.country).toBe('South Korea');
      expect(result?.city).toBe('Seoul');
      expect(result?.isp).toBe('KT');
    });

    it('1시간 내 재요청 시 캐시를 반환하고 fetch를 다시 호출하지 않아야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          status: 'success',
          query: '1.2.3.4',
          country: 'South Korea',
          city: 'Seoul',
          isp: 'KT',
        }),
      });

      // 첫 번째 호출
      const first = await collector.collect();
      // 두 번째 호출 (1시간 내)
      const second = await collector.collect();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('1시간 후 재요청 시 fetch를 다시 호출해야 한다', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        json: async () => ({
          status: 'success',
          query: '1.2.3.4',
          country: 'South Korea',
          city: 'Seoul',
          isp: 'KT',
        }),
      });

      // 첫 번째 호출
      await collector.collect();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 1시간 + 1ms 경과
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // 두 번째 호출
      await collector.collect();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('fetch 실패 시 null을 반환하고 에러를 throw하지 않아야 한다', async () => {
      mockFetch.mockRejectedValueOnce(new Error('네트워크 오류'));

      const result = await collector.collect();

      expect(result).toBeNull();
    });

    it('ip-api.com 응답 status가 success가 아니면 null을 반환해야 한다', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          status: 'fail',
          message: 'reserved range',
        }),
      });

      const result = await collector.collect();

      expect(result).toBeNull();
    });
  });
});
