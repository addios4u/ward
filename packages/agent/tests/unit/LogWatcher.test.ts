import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// fs 모킹
vi.mock('fs');

import { LogWatcher } from '../../src/logs/LogWatcher.js';

describe('LogWatcher', () => {
  let watcher: LogWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = new LogWatcher();
  });

  afterEach(() => {
    watcher.unwatchAll();
  });

  describe('watch', () => {
    it('파일 감시를 등록해야 한다', () => {
      const mockStat = { size: 100 } as fs.Stats;
      vi.mocked(fs.statSync).mockReturnValue(mockStat);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: vi.fn(),
      } as unknown as fs.FSWatcher);

      watcher.watch('/var/log/nginx/access.log', 'nginx');

      expect(fs.watch).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        { persistent: false },
        expect.any(Function)
      );
      expect(watcher.getWatchedSources()).toContain('nginx');
    });

    it('같은 파일을 중복 등록하면 무시해야 한다', () => {
      const mockStat = { size: 0 } as fs.Stats;
      vi.mocked(fs.statSync).mockReturnValue(mockStat);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: vi.fn(),
      } as unknown as fs.FSWatcher);

      watcher.watch('/var/log/app.log', 'app');
      watcher.watch('/var/log/app.log', 'app');

      expect(fs.watch).toHaveBeenCalledTimes(1);
    });

    it('파일이 없어도 감시 등록에 실패하지 않아야 한다', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      vi.mocked(fs.watch).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => watcher.watch('/nonexistent.log', 'app')).not.toThrow();
    });
  });

  describe('unwatch', () => {
    it('감시 중인 파일을 해제해야 한다', () => {
      const mockClose = vi.fn();
      const mockStat = { size: 0 } as fs.Stats;
      vi.mocked(fs.statSync).mockReturnValue(mockStat);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: mockClose,
      } as unknown as fs.FSWatcher);

      watcher.watch('/var/log/app.log', 'app');
      watcher.unwatch('/var/log/app.log');

      expect(mockClose).toHaveBeenCalled();
      expect(watcher.getWatchedSources()).not.toContain('app');
    });
  });

  describe('파일 변경 이벤트', () => {
    it('새 라인이 추가되면 line 이벤트를 발생시켜야 한다', () => {
      const mockClose = vi.fn();
      let changeCallback: ((event: string) => void) | null = null;

      const mockStat = { size: 0 } as fs.Stats;
      vi.mocked(fs.statSync)
        .mockReturnValueOnce(mockStat) // watch() 내부 초기 stat
        .mockReturnValue({ size: 17 } as fs.Stats); // 변경 감지 시 stat

      vi.mocked(fs.watch).mockImplementation((_path, _opts, cb) => {
        changeCallback = cb as (event: string) => void;
        return { on: vi.fn(), close: mockClose } as unknown as fs.FSWatcher;
      });

      vi.mocked(fs.openSync).mockReturnValue(3);
      vi.mocked(fs.readSync).mockImplementation((_fd, buffer) => {
        const data = Buffer.from('hello world\ntest\n');
        data.copy(buffer as Buffer);
        return data.length;
      });
      vi.mocked(fs.closeSync).mockReturnValue(undefined);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      watcher.watch('/var/log/app.log', 'app');

      // 파일 변경 이벤트 트리거
      changeCallback!('change');

      expect(lineHandler).toHaveBeenCalledWith('app', 'hello world');
      expect(lineHandler).toHaveBeenCalledWith('app', 'test');
    });

    it('파일 크기가 줄어들면 처음부터 다시 읽어야 한다 (로테이션 감지)', () => {
      let changeCallback: ((event: string) => void) | null = null;

      // 초기 파일 크기: 100
      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ size: 100 } as fs.Stats)
        // 로테이션 후 크기: 5 (100보다 작음)
        .mockReturnValue({ size: 5 } as fs.Stats);

      vi.mocked(fs.watch).mockImplementation((_path, _opts, cb) => {
        changeCallback = cb as (event: string) => void;
        return { on: vi.fn(), close: vi.fn() } as unknown as fs.FSWatcher;
      });

      vi.mocked(fs.openSync).mockReturnValue(3);
      vi.mocked(fs.readSync).mockImplementation((_fd, buffer) => {
        const data = Buffer.from('new\n\n');
        data.copy(buffer as Buffer);
        return data.length;
      });
      vi.mocked(fs.closeSync).mockReturnValue(undefined);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      watcher.watch('/var/log/app.log', 'app');
      changeCallback!('change');

      // position이 0으로 리셋된 후 새 내용을 읽었는지 확인
      expect(fs.readSync).toHaveBeenCalled();
      expect(lineHandler).toHaveBeenCalledWith('app', 'new');
    });

    it('파일 읽기 오류 시 error 이벤트를 발생시켜야 한다', () => {
      let changeCallback: ((event: string) => void) | null = null;

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ size: 0 } as fs.Stats)
        .mockImplementation(() => {
          throw new Error('권한 없음');
        });

      vi.mocked(fs.watch).mockImplementation((_path, _opts, cb) => {
        changeCallback = cb as (event: string) => void;
        return { on: vi.fn(), close: vi.fn() } as unknown as fs.FSWatcher;
      });

      const errorHandler = vi.fn();
      watcher.on('error', errorHandler);

      watcher.watch('/var/log/app.log', 'app');
      changeCallback!('change');

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('unwatchAll', () => {
    it('모든 감시를 해제해야 한다', () => {
      const mockClose = vi.fn();
      vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as fs.Stats);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: mockClose,
      } as unknown as fs.FSWatcher);

      watcher.watch('/var/log/app.log', 'app');
      watcher.watch('/var/log/nginx.log', 'nginx');
      watcher.unwatchAll();

      expect(mockClose).toHaveBeenCalledTimes(2);
      expect(watcher.getWatchedSources()).toHaveLength(0);
    });
  });
});
