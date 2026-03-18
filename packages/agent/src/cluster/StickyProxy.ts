import net from 'node:net';
import { EventEmitter } from 'events';

/**
 * TCP 레벨 스티키 프록시
 *
 * 클라이언트 IP 해시 기반으로 항상 같은 워커 포트로 연결을 고정한다.
 * pm2 cluster 모드와 달리 Node.js cluster 모듈을 사용하지 않으므로
 * WebSocket 연결이 워커를 이동하지 않는다.
 *
 * 동작 방식:
 *   1. proxyPort 로 TCP 연결 수신 (pauseOnConnect: true)
 *   2. 클라이언트 IP → djb2 해시 → 워커 인덱스 결정
 *   3. 해당 워커 포트로 소켓 pipe
 */
export class StickyProxy extends EventEmitter {
  private server: net.Server | null = null;
  private readonly proxyPort: number;
  private workerPorts: number[];

  constructor(proxyPort: number, workerPorts: number[]) {
    super();
    this.proxyPort = proxyPort;
    this.workerPorts = [...workerPorts];
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer({ pauseOnConnect: true }, (socket) => {
        const remoteAddress = socket.remoteAddress ?? '0.0.0.0';
        const targetPort = this._selectPort(remoteAddress);

        const target = net.createConnection(targetPort, '127.0.0.1', () => {
          socket.resume();
          socket.pipe(target);
          target.pipe(socket);
        });

        target.on('error', () => { socket.destroy(); });
        socket.on('error', () => { target.destroy(); });
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.proxyPort, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) { resolve(); return; }
      const srv = this.server;
      this.server = null;
      srv.close(() => resolve());
    });
  }

  /** 워커 포트 목록 갱신 */
  updateWorkerPorts(ports: number[]): void {
    this.workerPorts = [...ports];
  }

  /** 클라이언트 IP 해시로 워커 포트 선택 */
  selectPort(remoteAddress: string): number {
    return this._selectPort(remoteAddress);
  }

  private _selectPort(remoteAddress: string): number {
    if (this.workerPorts.length === 0) return this.proxyPort;
    const hash = this._hashString(remoteAddress);
    return this.workerPorts[hash % this.workerPorts.length];
  }

  /** djb2 변형 해시 함수 (unsigned 32-bit) */
  private _hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
    }
    return hash;
  }
}
