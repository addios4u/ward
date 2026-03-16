import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// vi.hoisted로 mock 함수를 먼저 생성 (vi.mock 호이스팅보다 먼저 실행)
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

// child_process 모킹
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// fs 모킹
vi.mock('fs');
import fs from 'fs';

import { ServiceWatcher } from '../../src/logs/ServiceWatcher.js';
import type { ServiceConfig } from '../../src/config/ServiceConfig.js';

// 가짜 ChildProcess 생성 헬퍼
function makeChild(lines: string[] = []) {
  const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const child = new EventEmitter() as ReturnType<typeof mockSpawn>;
  (child as any).stdout = stdout;
  (child as any).stderr = stderr;
  (child as any).pid = 9999;
  (child as any).kill = vi.fn();
  return { child, stdout, stderr };
}

describe('ServiceWatcher', () => {
  let watcher: ServiceWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    watcher = new ServiceWatcher();
  });

  afterEach(() => {
    watcher.unwatchAll();
  });

  // ──────────────────────────────────────────
  // file 방식
  // ──────────────────────────────────────────
  describe('file 방식', () => {
    it('파일이 존재하면 fs.watch를 등록해야 한다', () => {
      vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as fs.Stats);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: vi.fn(),
      } as unknown as fs.FSWatcher);

      const cfg: ServiceConfig = { name: 'nginx', method: 'file', paths: ['/var/log/nginx/access.log'] };
      watcher.watch(cfg);

      expect(fs.watch).toHaveBeenCalledWith(
        expect.stringContaining('access.log'),
        { persistent: false },
        expect.any(Function),
      );
      expect(watcher.getWatchedNames()).toContain('nginx');
    });

    it('같은 name을 중복 등록하면 무시해야 한다', () => {
      vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as fs.Stats);
      vi.mocked(fs.watch).mockReturnValue({
        on: vi.fn(),
        close: vi.fn(),
      } as unknown as fs.FSWatcher);

      const cfg: ServiceConfig = { name: 'app', method: 'file', paths: ['/var/log/app.log'] };
      watcher.watch(cfg);
      watcher.watch(cfg);

      expect(fs.watch).toHaveBeenCalledTimes(1);
    });

    it('파일이 없어도 예외가 발생하지 않아야 한다', () => {
      vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('ENOENT'); });
      vi.mocked(fs.watch).mockImplementation(() => { throw new Error('ENOENT'); });

      const cfg: ServiceConfig = { name: 'missing', method: 'file', paths: ['/no/such/file.log'] };
      expect(() => watcher.watch(cfg)).not.toThrow();
    });

    it('파일에 새 라인 추가 시 line 이벤트를 발생시켜야 한다', () => {
      let changeCallback: ((event: string) => void) | null = null;

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ size: 0 } as fs.Stats)
        .mockReturnValue({ size: 13 } as fs.Stats);

      vi.mocked(fs.watch).mockImplementation((_p, _o, cb) => {
        changeCallback = cb as (event: string) => void;
        return { on: vi.fn(), close: vi.fn() } as unknown as fs.FSWatcher;
      });

      vi.mocked(fs.openSync).mockReturnValue(3);
      vi.mocked(fs.readSync).mockImplementation((_fd, buffer) => {
        const data = Buffer.from('hello world\n\n');
        data.copy(buffer as Buffer);
        return data.length;
      });
      vi.mocked(fs.closeSync).mockReturnValue(undefined);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'app', method: 'file', paths: ['/var/log/app.log'] };
      watcher.watch(cfg);
      changeCallback!('change');

      expect(lineHandler).toHaveBeenCalledWith('app', 'hello world');
    });
  });

  // ──────────────────────────────────────────
  // exec 방식
  // ──────────────────────────────────────────
  describe('exec 방식', () => {
    it('spawn을 호출해야 한다', () => {
      const { child, stdout, stderr } = makeChild();
      mockSpawn.mockReturnValue(child);

      const cfg: ServiceConfig = { name: 'myapp', method: 'exec', command: 'node app.js' };
      watcher.watch(cfg);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
      );
      expect(watcher.getWatchedNames()).toContain('myapp');
    });

    it('stdout 라인이 line 이벤트로 발생해야 한다', () => {
      const { child, stdout } = makeChild();
      mockSpawn.mockReturnValue(child);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'myapp', method: 'exec', command: 'node app.js' };
      watcher.watch(cfg);

      (stdout as EventEmitter).emit('data', Buffer.from('log line one\nlog line two\n'));

      expect(lineHandler).toHaveBeenCalledWith('myapp', 'log line one');
      expect(lineHandler).toHaveBeenCalledWith('myapp', 'log line two');
    });

    it('stderr 라인도 line 이벤트로 발생해야 한다', () => {
      const { child, stderr } = makeChild();
      mockSpawn.mockReturnValue(child);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'myapp', method: 'exec', command: 'node app.js' };
      watcher.watch(cfg);

      (stderr as EventEmitter).emit('data', Buffer.from('error message\n'));

      expect(lineHandler).toHaveBeenCalledWith('myapp', 'error message');
    });

    it('프로세스 종료 후 재시작해야 한다', async () => {
      vi.useFakeTimers();
      const { child: child1 } = makeChild();
      const { child: child2 } = makeChild();
      mockSpawn.mockReturnValueOnce(child1).mockReturnValueOnce(child2);

      const cfg: ServiceConfig = { name: 'myapp', method: 'exec', command: 'node app.js' };
      watcher.watch(cfg);

      (child1 as EventEmitter).emit('close', 1);

      // 재시작 딜레이 대기
      await vi.runAllTimersAsync();

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  // ──────────────────────────────────────────
  // journal 방식
  // ──────────────────────────────────────────
  describe('journal 방식', () => {
    it('journalctl 명령으로 spawn해야 한다', () => {
      const { child } = makeChild();
      mockSpawn.mockReturnValue(child);

      const cfg: ServiceConfig = { name: 'svc', method: 'journal', unit: 'nginx.service' };
      watcher.watch(cfg);

      expect(mockSpawn).toHaveBeenCalledWith(
        'journalctl',
        expect.arrayContaining(['-u', 'nginx.service', '-f', '--no-pager']),
        expect.any(Object),
      );
    });

    it('journalctl stdout 라인이 line 이벤트로 발생해야 한다', () => {
      const { child, stdout } = makeChild();
      mockSpawn.mockReturnValue(child);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'svc', method: 'journal', unit: 'nginx.service' };
      watcher.watch(cfg);

      (stdout as EventEmitter).emit('data', Buffer.from('Mar 01 systemd: started\n'));

      expect(lineHandler).toHaveBeenCalledWith('svc', 'Mar 01 systemd: started');
    });
  });

  // ──────────────────────────────────────────
  // docker 방식
  // ──────────────────────────────────────────
  describe('docker 방식', () => {
    it('docker logs 명령으로 spawn해야 한다', () => {
      const { child } = makeChild();
      mockSpawn.mockReturnValue(child);

      const cfg: ServiceConfig = { name: 'web', method: 'docker', container: 'my-container' };
      watcher.watch(cfg);

      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['logs', '-f', '--tail=0', 'my-container']),
        expect.any(Object),
      );
    });

    it('docker stdout/stderr 라인이 line 이벤트로 발생해야 한다', () => {
      const { child, stdout, stderr } = makeChild();
      mockSpawn.mockReturnValue(child);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'web', method: 'docker', container: 'my-container' };
      watcher.watch(cfg);

      (stdout as EventEmitter).emit('data', Buffer.from('container log\n'));
      (stderr as EventEmitter).emit('data', Buffer.from('container err\n'));

      expect(lineHandler).toHaveBeenCalledWith('web', 'container log');
      expect(lineHandler).toHaveBeenCalledWith('web', 'container err');
    });
  });

  // ──────────────────────────────────────────
  // pipe 방식
  // ──────────────────────────────────────────
  describe('pipe 방식', () => {
    it('sh -c 로 파이프 명령을 실행해야 한다', () => {
      const { child } = makeChild();
      mockSpawn.mockReturnValue(child);

      const cfg: ServiceConfig = { name: 'custom', method: 'pipe', command: 'cat /var/log/syslog | grep ERROR' };
      watcher.watch(cfg);

      expect(mockSpawn).toHaveBeenCalledWith(
        'sh',
        ['-c', 'cat /var/log/syslog | grep ERROR'],
        expect.any(Object),
      );
    });

    it('pipe stdout 라인이 line 이벤트로 발생해야 한다', () => {
      const { child, stdout } = makeChild();
      mockSpawn.mockReturnValue(child);

      const lineHandler = vi.fn();
      watcher.on('line', lineHandler);

      const cfg: ServiceConfig = { name: 'custom', method: 'pipe', command: 'tail -f /var/log/syslog' };
      watcher.watch(cfg);

      (stdout as EventEmitter).emit('data', Buffer.from('syslog entry\n'));

      expect(lineHandler).toHaveBeenCalledWith('custom', 'syslog entry');
    });
  });

  // ──────────────────────────────────────────
  // unwatch / unwatchAll
  // ──────────────────────────────────────────
  describe('unwatch', () => {
    it('exec 방식 unwatch 시 프로세스 그룹을 kill해야 한다', () => {
      const { child } = makeChild();
      mockSpawn.mockReturnValue(child);

      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const cfg: ServiceConfig = { name: 'myapp', method: 'exec', command: 'node app.js' };
      watcher.watch(cfg);
      watcher.unwatch('myapp');

      // process.kill(-pid, 'SIGTERM')으로 프로세스 그룹 전체 종료
      expect(processKillSpy).toHaveBeenCalledWith(-(child as any).pid, 'SIGTERM');
      expect(watcher.getWatchedNames()).not.toContain('myapp');

      processKillSpy.mockRestore();
    });

    it('unwatchAll은 모든 감시를 해제해야 한다', () => {
      const { child: c1 } = makeChild();
      const { child: c2 } = makeChild();
      mockSpawn.mockReturnValueOnce(c1).mockReturnValueOnce(c2);

      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      watcher.watch({ name: 'a', method: 'exec', command: 'cmd a' });
      watcher.watch({ name: 'b', method: 'exec', command: 'cmd b' });
      watcher.unwatchAll();

      expect(processKillSpy).toHaveBeenCalledWith(-(c1 as any).pid, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-(c2 as any).pid, 'SIGTERM');
      expect(watcher.getWatchedNames()).toHaveLength(0);

      processKillSpy.mockRestore();
    });
  });
});
