import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// fs 모듈 모킹
vi.mock('fs');

import * as fs from 'fs';
const mockFs = vi.mocked(fs);

describe('AgentConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('설정 파일이 없으면 null을 반환해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config).toBeNull();
    });

    it('설정 파일이 있으면 파일 내용을 로드해야 한다', async () => {
      const jsonContent = JSON.stringify({
        server: { url: 'http://my-server:4000', groupName: 'prod' },
        metrics: { interval: 30 },
        services: [{ name: 'nginx', method: 'file', paths: ['/var/log/nginx/access.log'] }],
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(jsonContent);

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config).not.toBeNull();
      expect(config!.server.url).toBe('http://my-server:4000');
      expect(config!.server.groupName).toBe('prod');
      expect(config!.metrics.interval).toBe(30);
      expect(config!.services).toHaveLength(1);
      expect(config!.services[0]?.name).toBe('nginx');
    });

    it('설정 파일 파싱 오류 시 null을 반환해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('파일 읽기 실패');
      });

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('설정을 JSON 파일로 저장해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      const { saveConfig } = await import('../../src/config/AgentConfig.js');

      const config = {
        server: { url: 'http://test:3000' },
        metrics: { interval: 15 },
        services: [] as never[],
      };

      saveConfig(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
      const [, content] = mockFs.writeFileSync.mock.calls[0] as [string, string, string];
      expect(content).toContain('http://test:3000');
    });

    it('Ward 디렉토리가 없으면 생성해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      const { saveConfig } = await import('../../src/config/AgentConfig.js');

      saveConfig({
        server: { url: 'http://test:3000' },
        metrics: { interval: 10 },
        services: [],
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.ward'),
        { recursive: true }
      );
    });
  });

  describe('addService / removeService', () => {
    it('addService는 새 서비스를 추가해야 한다', async () => {
      const { addService } = await import('../../src/config/AgentConfig.js');
      const config = { server: { url: '' }, metrics: { interval: 30 }, services: [] };
      const result = addService(config, { name: 'nginx', method: 'file' as const, paths: ['/var/log/nginx/access.log'] });
      expect(result.services).toHaveLength(1);
      expect(result.services[0]?.name).toBe('nginx');
    });

    it('addService는 동일 name이 있으면 교체해야 한다', async () => {
      const { addService } = await import('../../src/config/AgentConfig.js');
      const config = {
        server: { url: '' }, metrics: { interval: 30 },
        services: [{ name: 'nginx', method: 'file' as const, paths: ['/old.log'] }],
      };
      const result = addService(config, { name: 'nginx', method: 'file' as const, paths: ['/new.log'] });
      expect(result.services).toHaveLength(1);
      expect((result.services[0] as { paths: string[] }).paths[0]).toBe('/new.log');
    });

    it('removeService는 해당 서비스를 제거해야 한다', async () => {
      const { removeService } = await import('../../src/config/AgentConfig.js');
      const config = {
        server: { url: '' }, metrics: { interval: 30 },
        services: [{ name: 'nginx', method: 'file' as const, paths: [] }],
      };
      const result = removeService(config, 'nginx');
      expect(result.services).toHaveLength(0);
    });
  });

  describe('loadState / saveState', () => {
    it('state 파일이 없으면 null을 반환해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadState } = await import('../../src/config/AgentConfig.js');
      const state = loadState();

      expect(state).toBeNull();
    });

    it('state 파일이 있으면 내용을 로드해야 한다', async () => {
      const stateJson = JSON.stringify({
        serverId: 'srv-123',
        serverUrl: 'https://ward.example.com',
        hostname: 'my-host',
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stateJson);

      const { loadState } = await import('../../src/config/AgentConfig.js');
      const state = loadState();

      expect(state).not.toBeNull();
      expect(state!.serverId).toBe('srv-123');
      expect(state!.serverUrl).toBe('https://ward.example.com');
      expect(state!.hostname).toBe('my-host');
    });

    it('saveState는 state.json에 JSON을 저장해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      const { saveState } = await import('../../src/config/AgentConfig.js');

      saveState({
        serverId: 'srv-456',
        serverUrl: 'https://ward.example.com',
        hostname: 'my-host',
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
      const [filePath, content] = mockFs.writeFileSync.mock.calls[0] as [string, string, string];
      expect(filePath).toContain('state.json');
      expect(content).toContain('srv-456');
    });
  });

  describe('validateConfig', () => {
    it('유효한 설정은 빈 오류 배열을 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: 'http://test:3000' },
        metrics: { interval: 10 },
        services: [],
      });

      expect(errors).toHaveLength(0);
    });

    it('서버 URL이 없으면 오류를 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: '' },
        metrics: { interval: 10 },
        services: [],
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('URL'))).toBe(true);
    });

    it('수집 주기가 0 이하면 오류를 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: 'http://test:3000' },
        metrics: { interval: 0 },
        services: [],
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('경로 함수', () => {
    it('getWardDir는 홈 디렉토리 하위의 .ward 경로를 반환해야 한다', async () => {
      const { getWardDir } = await import('../../src/config/AgentConfig.js');
      const wardDir = getWardDir();
      expect(wardDir).toBe(path.join(os.homedir(), '.ward'));
    });

    it('getConfigPath는 config.json 경로를 반환해야 한다', async () => {
      const { getConfigPath } = await import('../../src/config/AgentConfig.js');
      const configPath = getConfigPath();
      expect(configPath).toBe(path.join(os.homedir(), '.ward', 'config.json'));
    });

    it('getStatePath는 state.json 경로를 반환해야 한다', async () => {
      const { getStatePath } = await import('../../src/config/AgentConfig.js');
      const statePath = getStatePath();
      expect(statePath).toBe(path.join(os.homedir(), '.ward', 'state.json'));
    });

    it('getPidPath는 agent.pid 경로를 반환해야 한다', async () => {
      const { getPidPath } = await import('../../src/config/AgentConfig.js');
      const pidPath = getPidPath();
      expect(pidPath).toBe(path.join(os.homedir(), '.ward', 'agent.pid'));
    });
  });
});
