import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// fs 모듈 모킹
vi.mock('fs');

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
    it('설정 파일이 없으면 기본값을 반환해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config.server.url).toBe('http://localhost:3000');
      expect(config.server.apiKey).toBe('');
      expect(config.metrics.interval).toBe(10);
      expect(config.logs).toEqual([]);
    });

    it('설정 파일이 있으면 파일 내용을 로드해야 한다', async () => {
      const yamlContent = `
server:
  url: "http://my-server:4000"
  apiKey: "test-api-key"
metrics:
  interval: 30
logs:
  - path: "/var/log/nginx/access.log"
    type: nginx
`;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(yamlContent);

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config.server.url).toBe('http://my-server:4000');
      expect(config.server.apiKey).toBe('test-api-key');
      expect(config.metrics.interval).toBe(30);
      expect(config.logs).toHaveLength(1);
      expect(config.logs[0]?.path).toBe('/var/log/nginx/access.log');
    });

    it('설정 파일 파싱 오류 시 기본값을 반환해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('파일 읽기 실패');
      });

      const { loadConfig } = await import('../../src/config/AgentConfig.js');
      const config = loadConfig();

      expect(config.server.url).toBe('http://localhost:3000');
    });
  });

  describe('saveConfig', () => {
    it('설정을 YAML 파일로 저장해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      const { saveConfig } = await import('../../src/config/AgentConfig.js');

      const config = {
        server: { url: 'http://test:3000', apiKey: 'key123' },
        metrics: { interval: 15 },
        logs: [],
      };

      saveConfig(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
      const [, content] = mockFs.writeFileSync.mock.calls[0] as [string, string, string];
      expect(content).toContain('http://test:3000');
      expect(content).toContain('key123');
    });

    it('Ward 디렉토리가 없으면 생성해야 한다', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      const { saveConfig } = await import('../../src/config/AgentConfig.js');

      saveConfig({
        server: { url: 'http://test:3000', apiKey: 'key' },
        metrics: { interval: 10 },
        logs: [],
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.ward'),
        { recursive: true }
      );
    });
  });

  describe('validateConfig', () => {
    it('유효한 설정은 빈 오류 배열을 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: 'http://test:3000', apiKey: 'my-api-key' },
        metrics: { interval: 10 },
        logs: [],
      });

      expect(errors).toHaveLength(0);
    });

    it('서버 URL이 없으면 오류를 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: '', apiKey: 'my-api-key' },
        metrics: { interval: 10 },
        logs: [],
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('URL'))).toBe(true);
    });

    it('API 키가 없으면 오류를 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: 'http://test:3000', apiKey: '' },
        metrics: { interval: 10 },
        logs: [],
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('API'))).toBe(true);
    });

    it('수집 주기가 0 이하면 오류를 반환해야 한다', async () => {
      const { validateConfig } = await import('../../src/config/AgentConfig.js');

      const errors = validateConfig({
        server: { url: 'http://test:3000', apiKey: 'key' },
        metrics: { interval: 0 },
        logs: [],
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

    it('getConfigPath는 config.yaml 경로를 반환해야 한다', async () => {
      const { getConfigPath } = await import('../../src/config/AgentConfig.js');
      const configPath = getConfigPath();

      expect(configPath).toBe(path.join(os.homedir(), '.ward', 'config.yaml'));
    });

    it('getPidPath는 agent.pid 경로를 반환해야 한다', async () => {
      const { getPidPath } = await import('../../src/config/AgentConfig.js');
      const pidPath = getPidPath();

      expect(pidPath).toBe(path.join(os.homedir(), '.ward', 'agent.pid'));
    });
  });
});
