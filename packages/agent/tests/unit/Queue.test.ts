import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Queue } from '../../src/transport/Queue.js';

describe('Queue', () => {
  let queue: Queue;

  beforeEach(() => {
    queue = new Queue({ maxSize: 5, maxRetries: 2 });
  });

  describe('enqueue', () => {
    it('아이템을 큐에 추가해야 한다', () => {
      const item = queue.enqueue('/api/test', { data: 'test' });

      expect(item).not.toBeNull();
      expect(item?.path).toBe('/api/test');
      expect(item?.data).toEqual({ data: 'test' });
      expect(item?.retryCount).toBe(0);
      expect(queue.size).toBe(1);
    });

    it('최대 크기 초과 시 가장 오래된 항목을 제거해야 한다', () => {
      // 최대 크기(5)보다 많은 항목 추가
      for (let i = 0; i < 6; i++) {
        queue.enqueue('/api/test', { index: i });
      }

      expect(queue.size).toBe(5);
    });

    it('고유한 ID를 할당해야 한다', () => {
      const item1 = queue.enqueue('/api/test', {});
      const item2 = queue.enqueue('/api/test', {});

      expect(item1?.id).not.toBe(item2?.id);
    });
  });

  describe('dequeue', () => {
    it('큐에서 아이템을 꺼내야 한다', () => {
      queue.enqueue('/api/test', { data: 'first' });
      queue.enqueue('/api/test', { data: 'second' });

      const item = queue.dequeue();

      expect(item).not.toBeNull();
      expect(item?.data).toEqual({ data: 'first' });
      expect(queue.size).toBe(1);
    });

    it('큐가 비어있으면 null을 반환해야 한다', () => {
      const item = queue.dequeue();
      expect(item).toBeNull();
    });

    it('만료된 아이템을 자동으로 제거해야 한다', () => {
      // 만료 시간이 매우 짧은 큐 생성
      const shortQueue = new Queue({ maxAgeMs: 1 });
      shortQueue.enqueue('/api/test', { data: 'expired' });

      // 시간 경과 시뮬레이션
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);

      const item = shortQueue.dequeue();
      expect(item).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('dequeueAll', () => {
    it('모든 아이템을 한번에 꺼내야 한다', () => {
      queue.enqueue('/api/test', { index: 1 });
      queue.enqueue('/api/test', { index: 2 });
      queue.enqueue('/api/test', { index: 3 });

      const items = queue.dequeueAll();

      expect(items).toHaveLength(3);
      expect(queue.isEmpty).toBe(true);
    });
  });

  describe('requeueItem', () => {
    it('재시도 횟수를 증가시키고 다시 큐에 추가해야 한다', () => {
      const item = queue.enqueue('/api/test', {})!;
      queue.dequeue(); // 큐에서 꺼내기

      const requeued = queue.requeueItem(item);

      expect(requeued).toBe(true);
      expect(item.retryCount).toBe(1);
      expect(queue.size).toBe(1);
    });

    it('최대 재시도 횟수 초과 시 false를 반환해야 한다', () => {
      const item = queue.enqueue('/api/test', {})!;
      item.retryCount = 2; // maxRetries와 동일하게 설정

      const requeued = queue.requeueItem(item);

      expect(requeued).toBe(false);
      expect(queue.size).toBe(1); // dequeue 없이 enqueue만 했으므로
    });
  });

  describe('isEmpty / size', () => {
    it('초기에는 비어있어야 한다', () => {
      expect(queue.isEmpty).toBe(true);
      expect(queue.size).toBe(0);
    });

    it('아이템 추가 후 isEmpty는 false여야 한다', () => {
      queue.enqueue('/api/test', {});
      expect(queue.isEmpty).toBe(false);
      expect(queue.size).toBe(1);
    });
  });

  describe('clear', () => {
    it('큐를 비워야 한다', () => {
      queue.enqueue('/api/test', {});
      queue.enqueue('/api/test', {});
      queue.clear();

      expect(queue.isEmpty).toBe(true);
      expect(queue.size).toBe(0);
    });
  });
});
