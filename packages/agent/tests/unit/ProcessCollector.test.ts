import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessCollector } from '../../src/metrics/ProcessCollector.js';

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    processes: vi.fn(),
  },
}));

describe('ProcessCollector', () => {
  let collector: ProcessCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new ProcessCollector();
  });

  it('프로세스 목록을 올바르게 수집해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.processes).mockResolvedValue({
      all: 150,
      running: 5,
      blocked: 0,
      sleeping: 145,
      unknown: 0,
      list: [
        {
          pid: 1234,
          parentPid: 1,
          name: 'node',
          cpu: 25.5,
          cpuu: 20,
          cpus: 5.5,
          mem: 512 * 1024 * 1024,
          priority: 0,
          memVsz: 0,
          memRss: 512 * 1024 * 1024,
          nice: 0,
          started: '',
          state: 'running',
          tty: '',
          user: 'root',
          command: 'node server.js',
          params: '',
          path: '/usr/bin/node',
        },
        {
          pid: 5678,
          parentPid: 1,
          name: 'nginx',
          cpu: 2.1,
          cpuu: 1,
          cpus: 1.1,
          mem: 128 * 1024 * 1024,
          priority: 0,
          memVsz: 0,
          memRss: 128 * 1024 * 1024,
          nice: 0,
          started: '',
          state: 'sleeping',
          tty: '',
          user: 'www-data',
          command: 'nginx: master process',
          params: '',
          path: '/usr/sbin/nginx',
        },
      ],
    } as any);

    const metrics = await collector.collect();

    expect(metrics.total).toBe(150);
    expect(metrics.running).toBe(5);
    expect(metrics.processes).toHaveLength(2);
    // CPU 사용률 기준 내림차순 정렬 확인
    expect(metrics.processes[0]?.pid).toBe(1234);
    expect(metrics.processes[0]?.name).toBe('node');
    expect(metrics.processes[0]?.cpuUsage).toBe(25.5);
    expect(metrics.processes[0]?.memUsage).toBe(512 * 1024 * 1024);
    expect(metrics.processes[0]?.status).toBe('running');
  });

  it('프로세스를 CPU 사용률 기준으로 내림차순 정렬해야 한다', async () => {
    const si = await import('systeminformation');
    vi.mocked(si.default.processes).mockResolvedValue({
      all: 3,
      running: 3,
      blocked: 0,
      sleeping: 0,
      unknown: 0,
      list: [
        { pid: 1, name: 'low', cpu: 5, memRss: 0, state: 'running', parentPid: 0, cpuu: 0, cpus: 0, mem: 0, priority: 0, memVsz: 0, nice: 0, started: '', tty: '', user: '', command: '', params: '', path: '' },
        { pid: 2, name: 'high', cpu: 90, memRss: 0, state: 'running', parentPid: 0, cpuu: 0, cpus: 0, mem: 0, priority: 0, memVsz: 0, nice: 0, started: '', tty: '', user: '', command: '', params: '', path: '' },
        { pid: 3, name: 'mid', cpu: 50, memRss: 0, state: 'running', parentPid: 0, cpuu: 0, cpus: 0, mem: 0, priority: 0, memVsz: 0, nice: 0, started: '', tty: '', user: '', command: '', params: '', path: '' },
      ],
    } as any);

    const metrics = await collector.collect();

    expect(metrics.processes[0]?.name).toBe('high');
    expect(metrics.processes[1]?.name).toBe('mid');
    expect(metrics.processes[2]?.name).toBe('low');
  });

  it('최대 50개의 프로세스만 반환해야 한다', async () => {
    const si = await import('systeminformation');
    const manyProcesses = Array.from({ length: 100 }, (_, i) => ({
      pid: i + 1,
      name: `process-${i}`,
      cpu: Math.random() * 100,
      memRss: 1024,
      state: 'running',
      parentPid: 1,
      cpuu: 0,
      cpus: 0,
      mem: 0,
      priority: 0,
      memVsz: 0,
      nice: 0,
      started: '',
      tty: '',
      user: '',
      command: '',
      params: '',
      path: '',
    }));

    vi.mocked(si.default.processes).mockResolvedValue({
      all: 100,
      running: 100,
      blocked: 0,
      sleeping: 0,
      unknown: 0,
      list: manyProcesses,
    } as any);

    const metrics = await collector.collect();

    expect(metrics.processes.length).toBeLessThanOrEqual(50);
  });
});
