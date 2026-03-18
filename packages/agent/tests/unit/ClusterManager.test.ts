import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// vi.hoisted로 mock 함수 먼저 생성
const { mockSpawn, mockProxyStart, mockProxyStop } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockProxyStart: vi.fn().mockResolvedValue(undefined),
  mockProxyStop: vi.fn().mockResolvedValue(undefined),
}));

// child_process 모킹
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// StickyProxy 모킹
vi.mock('../../src/cluster/StickyProxy.js', () => ({
  StickyProxy: vi.fn().mockImplementation(() => ({
    start: mockProxyStart,
    stop: mockProxyStop,
    updateWorkerPorts: vi.fn(),
  })),
}));

// pidusage 모킹
vi.mock('pidusage', () => ({
  default: vi.fn().mockResolvedValue({ cpu: 0, memory: 0 }),
}));

import { ClusterManager } from '../../src/cluster/ClusterManager.js';
import type { ExecServiceConfig } from '../../src/config/ServiceConfig.js';

// 가짜 ChildProcess 생성 헬퍼
function makeChild(pid = 1000) {
  const stdout = new EventEmitter() as any;
  const stderr = new EventEmitter() as any;
  const child = new EventEmitter() as any;
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = pid;
  child.exitCode = null;
  child.kill = vi.fn();
  return { child, stdout, stderr };
}

// 기본 클러스터 설정
const baseConfig: ExecServiceConfig = {
  name: 'myapp',
  method: 'exec',
  command: 'node app.js',
  restartDelay: 100,
  cluster: {
    instances: 3,
    port: 3000,
    startPort: 3001,
  },
};

describe('ClusterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProxyStart.mockResolvedValue(undefined);
    mockProxyStop.mockResolvedValue(undefined);
  });

  describe('생성자', () => {
    it('cluster 설정이 없으면 에러를 던져야 한다', () => {
      const config: ExecServiceConfig = { name: 'test', method: 'exec', command: 'node app.js' };
      expect(() => new ClusterManager(config)).toThrow('cluster 설정이 없습니다');
    });
  });

  describe('start()', () => {
    it('instances 수만큼 워커를 spawn해야 한다', async () => {
      const children = [makeChild(1001), makeChild(1002), makeChild(1003)];
      children.forEach(({ child }, i) => mockSpawn.mockReturnValueOnce(child));

      const manager = new ClusterManager(baseConfig);
      await manager.start();

      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(mockProxyStart).toHaveBeenCalledTimes(1);
    });

    it('각 워커에 PORT 환경변수를 주입해야 한다', async () => {
      [makeChild(1001), makeChild(1002), makeChild(1003)].forEach(({ child }) =>
        mockSpawn.mockReturnValueOnce(child)
      );

      const manager = new ClusterManager(baseConfig);
      await manager.start();

      const calls = mockSpawn.mock.calls;
      expect(calls[0][2].env.PORT).toBe('3001');
      expect(calls[1][2].env.PORT).toBe('3002');
      expect(calls[2][2].env.PORT).toBe('3003');
    });

    it('프록시를 먼저 시작해야 한다', async () => {
      const callOrder: string[] = [];
      mockProxyStart.mockImplementation(async () => { callOrder.push('proxy'); });
      mockSpawn.mockImplementation(() => {
        callOrder.push('spawn');
        return makeChild().child;
      });

      const manager = new ClusterManager(baseConfig);
      await manager.start();

      expect(callOrder[0]).toBe('proxy');
    });

    it('start 시 line 이벤트로 프록시 시작 메시지를 발생시켜야 한다', async () => {
      [makeChild(1001), makeChild(1002), makeChild(1003)].forEach(({ child }) =>
        mockSpawn.mockReturnValueOnce(child)
      );

      const manager = new ClusterManager(baseConfig);
      const lines: string[] = [];
      manager.on('line', (line: string) => lines.push(line));

      await manager.start();

      expect(lines.some(l => l.includes('프록시 시작'))).toBe(true);
    });
  });

  describe('워커 stdout/stderr 로그', () => {
    it('워커 stdout이 [워커N] 접두사와 함께 line 이벤트로 발생해야 한다', async () => {
      const { child, stdout } = makeChild(1001);
      mockSpawn.mockReturnValueOnce(child);

      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      const manager = new ClusterManager(config);
      const lines: string[] = [];
      manager.on('line', (line: string) => lines.push(line));

      await manager.start();
      stdout.emit('data', Buffer.from('hello world\n'));

      expect(lines.some(l => l.includes('[워커0]') && l.includes('hello world'))).toBe(true);
    });

    it('개행 없는 청크는 다음 청크와 합쳐 완성된 라인만 발생시켜야 한다', async () => {
      const { child, stdout } = makeChild(1001);
      mockSpawn.mockReturnValueOnce(child);

      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      const manager = new ClusterManager(config);
      const lines: string[] = [];
      manager.on('line', (line: string) => lines.push(line));

      await manager.start();
      stdout.emit('data', Buffer.from('hel'));
      expect(lines.filter(l => l.includes('[워커0]'))).toHaveLength(0);

      stdout.emit('data', Buffer.from('lo\n'));
      expect(lines.some(l => l.includes('hello'))).toBe(true);
    });
  });

  describe('워커 자동 재시작', () => {
    it('워커 종료 시 restartDelay 후 재시작해야 한다', async () => {
      vi.useFakeTimers();

      const { child: child1 } = makeChild(1001);
      const { child: child2 } = makeChild(1002);
      const { child: child3 } = makeChild(1003);
      const { child: child1b } = makeChild(1004);

      mockSpawn
        .mockReturnValueOnce(child1)
        .mockReturnValueOnce(child2)
        .mockReturnValueOnce(child3)
        .mockReturnValueOnce(child1b);

      const manager = new ClusterManager(baseConfig);
      await manager.start();

      expect(mockSpawn).toHaveBeenCalledTimes(3);

      // 워커 0 종료
      (child1 as any).exitCode = 1;
      (child1 as EventEmitter).emit('close', 1);

      await vi.runAllTimersAsync();

      // 워커 0만 재시작 (총 4번 spawn)
      expect(mockSpawn).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it('stop() 후에는 워커가 재시작되지 않아야 한다', async () => {
      vi.useFakeTimers();

      const { child } = makeChild(1001);
      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      mockSpawn.mockReturnValue(child);

      const manager = new ClusterManager(config);
      await manager.start();
      await manager.stop();

      (child as any).exitCode = 1;
      (child as EventEmitter).emit('close', 1);
      await vi.runAllTimersAsync();

      // stop 후이므로 재시작 spawn이 없어야 함
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('stop()', () => {
    it('모든 워커를 종료하고 프록시를 닫아야 한다', async () => {
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const { child: c1 } = makeChild(1001);
      const { child: c2 } = makeChild(1002);
      const { child: c3 } = makeChild(1003);
      mockSpawn.mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(c3);

      const manager = new ClusterManager(baseConfig);
      await manager.start();
      await manager.stop();

      // 각 워커의 프로세스 그룹 종료
      expect(processKillSpy).toHaveBeenCalledWith(-1001, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-1002, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-1003, 'SIGTERM');
      expect(mockProxyStop).toHaveBeenCalled();

      processKillSpy.mockRestore();
    });

    it('stop()을 두 번 호출해도 멱등적이어야 한다', async () => {
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      const { child } = makeChild(1001);
      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      mockSpawn.mockReturnValue(child);

      const manager = new ClusterManager(config);
      await manager.start();
      await manager.stop();
      await manager.stop(); // 두 번째 호출

      expect(mockProxyStop).toHaveBeenCalledTimes(1);

      processKillSpy.mockRestore();
    });
  });

  describe('restart()', () => {
    it('workerIndex 미지정 시 전체 워커를 재시작해야 한다', async () => {
      vi.useFakeTimers();
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const { child: c1 } = makeChild(1001);
      const { child: c2 } = makeChild(1002);
      const { child: c3 } = makeChild(1003);
      mockSpawn.mockReturnValue(makeChild(2000).child);
      mockSpawn.mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(c3);

      const manager = new ClusterManager(baseConfig);
      await manager.start();

      manager.restart(); // 전체 재시작

      await vi.runAllTimersAsync();

      // 3개 워커 SIGTERM
      expect(processKillSpy).toHaveBeenCalledWith(-1001, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-1002, 'SIGTERM');
      expect(processKillSpy).toHaveBeenCalledWith(-1003, 'SIGTERM');

      processKillSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('getStatus()', () => {
    it('실행 중인 워커가 있으면 status가 running이어야 한다', async () => {
      const { child } = makeChild(1001);
      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      mockSpawn.mockReturnValue(child);

      const manager = new ClusterManager(config);
      await manager.start();

      const status = manager.getStatus();
      expect(status.status).toBe('running');
      expect(status.workerPids).toContain(1001);
    });

    it('stop() 후 status가 stopped이어야 한다', async () => {
      const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      const { child } = makeChild(1001);
      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 1, port: 3000, startPort: 3001 } };
      mockSpawn.mockReturnValue(child);

      const manager = new ClusterManager(config);
      await manager.start();

      // 워커를 종료 상태로 만들기
      (child as any).exitCode = 0;
      await manager.stop();

      const status = manager.getStatus();
      expect(status.status).toBe('stopped');

      processKillSpy.mockRestore();
    });

    it('totalRestartCount는 전체 워커 재시작 횟수 합산이어야 한다', async () => {
      vi.useFakeTimers();

      const { child: c1 } = makeChild(1001);
      const { child: c2 } = makeChild(1002);
      const { child: c1b } = makeChild(1003);
      const config: ExecServiceConfig = { ...baseConfig, cluster: { instances: 2, port: 3000, startPort: 3001 } };
      mockSpawn
        .mockReturnValueOnce(c1)
        .mockReturnValueOnce(c2)
        .mockReturnValueOnce(c1b);

      const manager = new ClusterManager(config);
      await manager.start();

      // 워커 0 종료 → 재시작 → restartCount = 1
      (c1 as any).exitCode = 1;
      (c1 as EventEmitter).emit('close', 1);
      await vi.runAllTimersAsync();

      const status = manager.getStatus();
      expect(status.totalRestartCount).toBe(1);

      vi.useRealTimers();
    });
  });
});
