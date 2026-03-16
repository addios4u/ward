import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted로 mock 함수 먼저 생성
const {
  mockSpawn,
  mockExistsSync,
  mockMkdirSync,
  mockWriteFileSync,
  mockReadFileSync,
  mockUnlinkSync,
  mockFetch,
  mockOsInfo,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockFetch: vi.fn(),
  mockOsInfo: vi.fn(),
}));

// systeminformation 모킹
vi.mock('systeminformation', () => ({
  default: {
    osInfo: mockOsInfo,
  },
}));

// child_process 모킹
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// fs 모킹
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
  },
}));

// AgentConfig 모킹
vi.mock('../../src/config/AgentConfig.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    server: { url: 'http://localhost:3000' },
    metrics: { interval: 30 },
    logs: [],
  }),
  saveConfig: vi.fn(),
  saveState: vi.fn(),
  loadState: vi.fn().mockReturnValue(null),
  validateConfig: vi.fn().mockReturnValue([]),
  getWardDir: vi.fn().mockReturnValue('/home/user/.ward'),
  getPidPath: vi.fn().mockReturnValue('/home/user/.ward/agent.pid'),
  getStatePath: vi.fn().mockReturnValue('/home/user/.ward/state.json'),
}));

// systemd 모킹
vi.mock('../../src/cli/systemd.js', () => ({
  setupSystemd: vi.fn().mockResolvedValue(undefined),
  removeSystemd: vi.fn().mockResolvedValue(undefined),
}));

// fetch 전역 모킹 (register 호출용)
vi.stubGlobal('fetch', mockFetch);

// start 모듈을 최상위에서 한 번만 import
import { start, normalizeUrl } from '../../src/cli/start.js';

describe('start - PID 파일 처리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: PID 파일 없음, ward 디렉토리 있음
    mockExistsSync.mockImplementation((p: string) => {
      if (p === '/home/user/.ward/agent.pid') return false;
      if (p === '/home/user/.ward') return true;
      return false;
    });
    // register 요청 기본 응답
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ serverId: 'test-server-id' }),
    });
  });

  it('child.pid가 정상적인 숫자이면 PID 파일에 숫자를 저장해야 한다', async () => {
    mockSpawn.mockReturnValue({ pid: 12345, unref: vi.fn() });

    await start('http://localhost:3000', {});

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/home/user/.ward/agent.pid',
      '12345',
      'utf-8'
    );
  });

  it('child.pid가 undefined이면 PID 파일을 저장하지 않고 에러를 출력해야 한다', async () => {
    mockSpawn.mockReturnValue({ pid: undefined, unref: vi.fn() });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await start('http://localhost:3000', {});

    // "undefined" 문자열이 PID 파일에 저장되면 안 됨
    const pidWriteCall = mockWriteFileSync.mock.calls.find(
      (call) => call[0] === '/home/user/.ward/agent.pid'
    );
    expect(pidWriteCall).toBeUndefined();

    // 에러 출력 또는 프로세스 종료가 있어야 함
    const hasError =
      consoleErrorSpy.mock.calls.length > 0 || processExitSpy.mock.calls.length > 0;
    expect(hasError).toBe(true);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});

describe('start - OS 정보 등록', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockImplementation((p: string) => {
      if (p === '/home/user/.ward/agent.pid') return false;
      if (p === '/home/user/.ward') return true;
      return false;
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ serverId: 'test-server-id' }),
    });
    // OS 정보 기본 응답
    mockOsInfo.mockResolvedValue({
      distro: 'Ubuntu',
      release: '22.04',
      arch: 'x64',
    });
    mockSpawn.mockReturnValue({ pid: 12345, unref: vi.fn() });
  });

  it('register 호출 시 osName, osVersion, arch를 포함해야 한다', async () => {
    await start('http://localhost:3000', {});

    // fetch가 register API를 호출했는지 확인
    const registerCall = mockFetch.mock.calls.find((call: unknown[]) =>
      typeof call[0] === 'string' && call[0].includes('/api/agent/register')
    );
    expect(registerCall).toBeDefined();

    const requestBody = JSON.parse(registerCall![1].body);
    expect(requestBody.osName).toBe('Ubuntu');
    expect(requestBody.osVersion).toBe('22.04');
    expect(requestBody.arch).toBe('x64');
  });
});

describe('normalizeUrl', () => {
  it('http://로 시작하는 URL은 그대로 반환해야 한다', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('https://로 시작하는 URL은 그대로 반환해야 한다', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('scheme이 없으면 https://를 자동으로 추가해야 한다', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
  });
});
