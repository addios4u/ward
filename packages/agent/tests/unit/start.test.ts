import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted로 mock 함수 먼저 생성
const {
  mockSpawn,
  mockExistsSync,
  mockMkdirSync,
  mockWriteFileSync,
  mockReadFileSync,
  mockUnlinkSync,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
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
    server: { url: 'http://localhost:3000', apiKey: 'test-key' },
    metrics: { interval: 10 },
    logs: [],
  }),
  validateConfig: vi.fn().mockReturnValue([]),
  getWardDir: vi.fn().mockReturnValue('/home/user/.ward'),
  getPidPath: vi.fn().mockReturnValue('/home/user/.ward/agent.pid'),
}));

// start 모듈을 최상위에서 한 번만 import (vi.mock은 호이스팅되므로 안전)
import { start } from '../../src/cli/start.js';

describe('start - PID 파일 처리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: PID 파일 없음, ward 디렉토리 있음
    mockExistsSync.mockImplementation((p: string) => {
      if (p === '/home/user/.ward/agent.pid') return false;
      if (p === '/home/user/.ward') return true;
      return false;
    });
  });

  it('child.pid가 정상적인 숫자이면 PID 파일에 숫자를 저장해야 한다', async () => {
    mockSpawn.mockReturnValue({ pid: 12345, unref: vi.fn() });

    await start();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/home/user/.ward/agent.pid',
      '12345',
      'utf-8'
    );
  });

  it('child.pid가 undefined이면 PID 파일을 저장하지 않고 에러를 출력해야 한다', async () => {
    mockSpawn.mockReturnValue({ pid: undefined, unref: vi.fn() });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await start();

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
