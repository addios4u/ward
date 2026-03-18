import path from 'node:path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import pidusage from 'pidusage';
import { StickyProxy } from './StickyProxy.js';
import type { ExecServiceConfig } from '../config/ServiceConfig.js';

// 메모리 체크 주기 (30초)
const MEM_CHECK_INTERVAL_MS = 30_000;

interface WorkerState {
  index: number;
  port: number;
  process: ChildProcess | null;
  restartCount: number;
  startedAt: Date | null;
  stopped: boolean;
  restartTimer?: ReturnType<typeof setTimeout>;
  memCheckTimer?: ReturnType<typeof setInterval>;
  lineBuffer: string; // 미완성 라인 버퍼
}

export interface ClusterStatus {
  status: 'running' | 'stopped';
  workerPids: number[];
  totalRestartCount: number;
  startedAt: Date | null;
}

/**
 * exec 서비스를 N개 독립 프로세스로 실행하고
 * TCP 스티키 프록시로 앞단에서 연결을 분배한다.
 *
 * pm2 cluster 모드와 달리 Node.js cluster 모듈을 사용하지 않는다.
 * 각 워커는 독립된 포트를 사용하고, 프록시가 IP 해시 기반으로
 * 클라이언트를 항상 같은 워커로 고정해 WebSocket 버그를 방지한다.
 */
export class ClusterManager extends EventEmitter {
  private readonly config: ExecServiceConfig;
  private readonly workers: WorkerState[];
  private readonly proxy: StickyProxy;
  private stopped = false;
  private startedAt: Date | null = null;

  constructor(config: ExecServiceConfig) {
    super();
    if (!config.cluster) throw new Error('cluster 설정이 없습니다');

    this.config = config;
    const { instances, port, startPort } = config.cluster;

    this.workers = Array.from({ length: instances }, (_, i) => ({
      index: i,
      port: startPort + i,
      process: null,
      restartCount: 0,
      startedAt: null,
      stopped: false,
      lineBuffer: '',
    }));

    this.proxy = new StickyProxy(port, this.workers.map(w => w.port));
  }

  /** 프록시 + 전체 워커 시작 */
  async start(): Promise<void> {
    this.stopped = false;
    this.startedAt = new Date();

    await this.proxy.start();
    this._emitLine(`[ward-cluster] 프록시 시작 (포트: ${this.config.cluster!.port}, 워커: ${this.workers.length}개)`);

    for (const worker of this.workers) {
      this._spawnWorker(worker);
    }
  }

  /** 전체 워커 + 프록시 중지 */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    for (const worker of this.workers) {
      this._stopWorker(worker);
    }
    await this.proxy.stop();
  }

  /**
   * 워커 재시작
   * workerIndex 미지정 시 전체 워커 순차 재시작
   */
  restart(workerIndex?: number): void {
    if (workerIndex !== undefined) {
      const worker = this.workers[workerIndex];
      if (worker) this._restartWorker(worker);
    } else {
      for (const worker of this.workers) {
        this._restartWorker(worker);
      }
    }
  }

  getStatus(): ClusterStatus {
    const workerPids = this.workers
      .map(w => w.process?.pid)
      .filter((pid): pid is number => pid !== undefined);

    const runningCount = this.workers.filter(
      w => !w.stopped && w.process !== null && w.process.exitCode === null
    ).length;

    return {
      status: runningCount > 0 ? 'running' : 'stopped',
      workerPids,
      totalRestartCount: this.workers.reduce((sum, w) => sum + w.restartCount, 0),
      startedAt: this.startedAt,
    };
  }

  private _spawnWorker(worker: WorkerState): void {
    if (this.stopped || worker.stopped) return;

    // 데몬의 node 바이너리 디렉토리를 PATH에 추가 (nvm 등 비표준 설치 환경 대응)
    const nodeBinDir = path.dirname(process.execPath);
    const currentPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
    const env = {
      ...process.env,
      PATH: currentPath.includes(nodeBinDir) ? currentPath : `${nodeBinDir}:${currentPath}`,
      PORT: String(worker.port), // 워커 포트 주입 (앱은 process.env.PORT를 사용해야 함)
    };

    worker.startedAt = new Date();
    const child = spawn('sh', ['-c', this.config.command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      detached: true,
    });
    worker.process = child;

    this.emit('status', 'running', child.pid, worker.index);
    this._emitLine(`[ward-cluster] 워커 ${worker.index} 시작 (PID: ${child.pid}, PORT: ${worker.port})`);

    child.stdout?.on('data', (chunk: Buffer) => {
      this._processChunk(worker, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this._processChunk(worker, chunk.toString('utf8'));
    });

    child.on('close', (code) => {
      if (worker.stopped || this.stopped) return;
      this._clearMemTimer(worker);
      this._emitLine(`[ward-cluster] 워커 ${worker.index} 종료 (code: ${code})`);
      this.emit('status', 'stopped', undefined, worker.index);
      worker.restartCount++;
      worker.restartTimer = setTimeout(() => {
        if (!worker.stopped && !this.stopped) {
          this._spawnWorker(worker);
        }
      }, this.config.restartDelay ?? 3000);
    });

    // 메모리 임계값 감시
    const maxMemBytes = this.config.maxMemBytes;
    if (maxMemBytes && maxMemBytes > 0) {
      worker.memCheckTimer = setInterval(async () => {
        if (worker.stopped || this.stopped || !child.pid) return;
        try {
          const stats = await pidusage(child.pid);
          if (stats.memory > maxMemBytes) {
            const mb = (stats.memory / 1024 / 1024).toFixed(1);
            const limitMb = (maxMemBytes / 1024 / 1024).toFixed(0);
            this._emitLine(`[ward-cluster] 워커 ${worker.index} 메모리 초과로 재시작: ${mb}MB > ${limitMb}MB`);
            child.kill('SIGTERM');
          }
        } catch { /* PID 접근 불가 시 무시 */ }
      }, MEM_CHECK_INTERVAL_MS);
    }
  }

  private _stopWorker(worker: WorkerState): void {
    worker.stopped = true;
    this._clearTimers(worker);
    if (worker.process?.pid) {
      try {
        process.kill(-worker.process.pid, 'SIGTERM');
      } catch {
        worker.process?.kill();
      }
    }
  }

  private _restartWorker(worker: WorkerState): void {
    this._clearTimers(worker);
    worker.stopped = false;
    if (worker.process?.pid) {
      try {
        process.kill(-worker.process.pid, 'SIGTERM');
      } catch {
        worker.process?.kill();
      }
    }
    setTimeout(() => {
      if (!worker.stopped && !this.stopped) {
        this._spawnWorker(worker);
      }
    }, 500);
  }

  /** stdout/stderr 청크를 라인 단위로 분리해 'line' 이벤트 발생 */
  private _processChunk(worker: WorkerState, text: string): void {
    const buffered = worker.lineBuffer + text;
    const lines = buffered.split('\n');
    worker.lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed.length > 0) {
        this.emit('line', `[워커${worker.index}] ${trimmed}`);
      }
    }
  }

  private _emitLine(text: string): void {
    this.emit('line', text);
  }

  private _clearMemTimer(worker: WorkerState): void {
    if (worker.memCheckTimer) {
      clearInterval(worker.memCheckTimer);
      worker.memCheckTimer = undefined;
    }
  }

  private _clearTimers(worker: WorkerState): void {
    this._clearMemTimer(worker);
    if (worker.restartTimer) {
      clearTimeout(worker.restartTimer);
      worker.restartTimer = undefined;
    }
  }
}
