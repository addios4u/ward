import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// net 모킹
const { mockCreateServer, mockCreateConnection } = vi.hoisted(() => ({
  mockCreateServer: vi.fn(),
  mockCreateConnection: vi.fn(),
}));

vi.mock('node:net', () => ({
  default: {
    createServer: mockCreateServer,
    createConnection: mockCreateConnection,
  },
}));

import { StickyProxy } from '../../src/cluster/StickyProxy.js';

// 가짜 net.Server 생성 헬퍼
function makeMockServer() {
  const server = new EventEmitter() as any;
  server.listen = vi.fn((_port: number, cb: () => void) => { cb(); return server; });
  server.close = vi.fn((cb: () => void) => { cb(); });
  return server;
}

describe('StickyProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start / stop', () => {
    it('start() 시 지정 포트로 서버를 시작해야 한다', async () => {
      const mockServer = makeMockServer();
      mockCreateServer.mockReturnValue(mockServer);

      const proxy = new StickyProxy(3000, [3001, 3002]);
      await proxy.start();

      expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    });

    it('stop() 시 서버를 닫아야 한다', async () => {
      const mockServer = makeMockServer();
      mockCreateServer.mockReturnValue(mockServer);

      const proxy = new StickyProxy(3000, [3001, 3002]);
      await proxy.start();
      await proxy.stop();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('stop()은 서버가 없어도 오류 없이 완료되어야 한다', async () => {
      const proxy = new StickyProxy(3000, [3001, 3002]);
      await expect(proxy.stop()).resolves.toBeUndefined();
    });

    it('stop()을 두 번 호출해도 오류가 없어야 한다 (멱등성)', async () => {
      const mockServer = makeMockServer();
      mockCreateServer.mockReturnValue(mockServer);

      const proxy = new StickyProxy(3000, [3001, 3002]);
      await proxy.start();
      await proxy.stop();
      await proxy.stop(); // 두 번째 호출 - 오류 없어야 함

      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('IP 해시 기반 스티키 라우팅', () => {
    it('같은 IP는 항상 같은 포트로 라우팅되어야 한다', () => {
      const proxy = new StickyProxy(3000, [3001, 3002, 3003, 3004]);

      const port1 = proxy.selectPort('192.168.1.100');
      const port2 = proxy.selectPort('192.168.1.100');
      const port3 = proxy.selectPort('192.168.1.100');

      expect(port1).toBe(port2);
      expect(port2).toBe(port3);
    });

    it('다른 IP는 다른 포트로 분산될 수 있어야 한다', () => {
      const proxy = new StickyProxy(3000, [3001, 3002, 3003, 3004]);

      const ports = new Set<number>();
      // 여러 IP로 테스트
      const ips = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '10.0.0.1', '172.16.0.1', '192.168.0.1', '8.8.8.8'];
      for (const ip of ips) {
        ports.add(proxy.selectPort(ip));
      }
      // 여러 IP가 여러 워커로 분산되는지 확인 (모두 같은 포트로 가면 부하분산이 안 됨)
      expect(ports.size).toBeGreaterThan(1);
    });

    it('선택된 포트는 항상 워커 포트 목록 안에 있어야 한다', () => {
      const workerPorts = [3001, 3002, 3003];
      const proxy = new StickyProxy(3000, workerPorts);

      const testIps = ['10.0.0.1', '192.168.1.1', '172.16.0.1', '::1', '127.0.0.1'];
      for (const ip of testIps) {
        const port = proxy.selectPort(ip);
        expect(workerPorts).toContain(port);
      }
    });

    it('워커 포트가 하나뿐이면 모든 IP가 같은 포트로 라우팅되어야 한다', () => {
      const proxy = new StickyProxy(3000, [3001]);

      expect(proxy.selectPort('1.2.3.4')).toBe(3001);
      expect(proxy.selectPort('5.6.7.8')).toBe(3001);
    });
  });

  describe('updateWorkerPorts', () => {
    it('포트 목록 갱신 후 새 포트 범위에서 라우팅되어야 한다', () => {
      const proxy = new StickyProxy(3000, [3001, 3002]);
      proxy.updateWorkerPorts([4001, 4002, 4003]);

      const port = proxy.selectPort('1.2.3.4');
      expect([4001, 4002, 4003]).toContain(port);
    });
  });
});
