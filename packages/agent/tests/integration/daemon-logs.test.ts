import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 의존성 모킹
vi.mock('systeminformation', () => ({
  default: {
    currentLoad: vi.fn().mockResolvedValue({
      avgLoad: 0,
      currentLoad: 0,
      currentLoadUser: 0,
      currentLoadSystem: 0,
      currentLoadNice: 0,
      currentLoadIdle: 100,
      currentLoadIrq: 0,
      currentLoadSteal: 0,
      currentLoadGuest: 0,
      rawCurrentLoad: 0,
      rawCurrentLoadUser: 0,
      rawCurrentLoadSystem: 0,
      rawCurrentLoadNice: 0,
      rawCurrentLoadIdle: 0,
      rawCurrentLoadIrq: 0,
      rawCurrentLoadSteal: 0,
      rawCurrentLoadGuest: 0,
      cpus: [],
    }),
    mem: vi.fn().mockResolvedValue({ total: 0, active: 0, available: 0, free: 0 }),
    fsSize: vi.fn().mockResolvedValue([]),
    networkStats: vi.fn().mockResolvedValue([]),
    processes: vi.fn().mockResolvedValue({ all: 0, running: 0, blocked: 0, sleeping: 0, unknown: 0, list: [] }),
  },
}));

const { mockLoadavg } = vi.hoisted(() => ({
  mockLoadavg: vi.fn().mockReturnValue([0, 0, 0]),
}));
vi.mock('os', () => ({
  default: { loadavg: mockLoadavg },
  loadavg: mockLoadavg,
}));

// LogWatcher/LogForwarder 모킹
const mockWatch = vi.fn();
const mockUnwatchAll = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockAddLog = vi.fn();

vi.mock('../../src/logs/LogWatcher.js', () => ({
  LogWatcher: vi.fn().mockImplementation(() => ({
    watch: mockWatch,
    unwatchAll: mockUnwatchAll,
    on: vi.fn(),
  })),
}));

vi.mock('../../src/logs/LogForwarder.js', () => ({
  LogForwarder: vi.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    addLog: mockAddLog,
  })),
}));

vi.mock('../../src/transport/HttpClient.js', () => ({
  HttpClient: vi.fn().mockImplementation(() => ({
    sendMetrics: vi.fn().mockResolvedValue({ success: true }),
    sendHeartbeat: vi.fn().mockResolvedValue({ success: true }),
    post: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('../../src/config/AgentConfig.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    server: { url: 'http://localhost:3000', apiKey: 'test-key' },
    metrics: { interval: 60 },
    logs: [
      { path: '/var/log/nginx/access.log', type: 'nginx' },
      { path: '/var/log/app/app.log', type: 'nodejs' },
    ],
  }),
}));

describe('daemon - LogWatcher/LogForwarder 연결', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('설정의 logs 배열에 따라 LogWatcher.watch()가 호출되어야 한다', async () => {
    const { LogWatcher } = await import('../../src/logs/LogWatcher.js');
    const { startDaemon } = await import('../../src/daemon.js');

    await startDaemon();

    const instance = vi.mocked(LogWatcher).mock.results[0]?.value;
    expect(instance.watch).toHaveBeenCalledWith('/var/log/nginx/access.log', 'nginx');
    expect(instance.watch).toHaveBeenCalledWith('/var/log/app/app.log', 'nodejs');
    expect(instance.watch).toHaveBeenCalledTimes(2);
  });

  it('LogForwarder.start()가 호출되어야 한다', async () => {
    const { LogForwarder } = await import('../../src/logs/LogForwarder.js');
    const { startDaemon } = await import('../../src/daemon.js');

    await startDaemon();

    const instance = vi.mocked(LogForwarder).mock.results[0]?.value;
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('logs 배열이 비어있으면 watch()가 호출되지 않아야 한다', async () => {
    const { loadConfig } = await import('../../src/config/AgentConfig.js');
    vi.mocked(loadConfig).mockReturnValue({
      server: { url: 'http://localhost:3000', apiKey: 'test-key' },
      metrics: { interval: 60 },
      logs: [],
    });

    const { LogWatcher } = await import('../../src/logs/LogWatcher.js');
    const { startDaemon } = await import('../../src/daemon.js');

    await startDaemon();

    const instance = vi.mocked(LogWatcher).mock.results[0]?.value;
    expect(instance.watch).not.toHaveBeenCalled();
  });
});
