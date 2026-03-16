import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import pidusage from 'pidusage';
import type { ServiceConfig } from '../config/ServiceConfig.js';

// 메모리 체크 주기 (30초)
const MEM_CHECK_INTERVAL_MS = 30_000;

// 감시 항목 내부 상태
interface WatchEntry {
  name: string;
  // file 방식
  fileWatchers?: Array<{ filePath: string; position: number; watcher: fs.FSWatcher | null }>;
  // 프로세스 방식 (exec/journal/docker/pipe)
  process?: ChildProcess;
  restartTimer?: ReturnType<typeof setTimeout>;
  memCheckTimer?: ReturnType<typeof setInterval>;  // 메모리 초과 감시 타이머
  stopped?: boolean;
  // 재시작을 위한 원본 설정
  config?: ServiceConfig;
  restartDelay?: number;
  // 상태 추적
  restartCount?: number;
  startedAt?: Date;
}

// 부분적으로 버퍼된 라인 (개행 미완성 데이터 보관용)
type LineBuffer = Record<string, string>;

/**
 * file / exec / journal / docker / pipe 방식으로
 * 서비스 로그를 수집해 'line' 이벤트를 발생시킨다.
 */
export class ServiceWatcher extends EventEmitter {
  private entries: Map<string, WatchEntry> = new Map();
  private lineBuffers: LineBuffer = {};

  // 서비스 감시 등록
  watch(config: ServiceConfig): void {
    if (this.entries.has(config.name)) return;

    switch (config.method) {
      case 'file':
        this._watchFile(config);
        break;
      case 'exec':
        this._watchExec(config);
        break;
      case 'journal':
        this._watchJournal(config);
        break;
      case 'docker':
        this._watchDocker(config);
        break;
      case 'pipe':
        this._watchPipe(config);
        break;
    }
  }

  // 특정 서비스 감시 해제
  unwatch(name: string): void {
    const entry = this.entries.get(name);
    if (!entry) return;

    entry.stopped = true;

    // 파일 감시 해제
    if (entry.fileWatchers) {
      for (const fw of entry.fileWatchers) {
        fw.watcher?.close();
      }
    }

    // 프로세스 종료
    if (entry.process) {
      try { entry.process.kill(); } catch { /* 이미 종료된 경우 무시 */ }
    }

    // 재시작 타이머 취소
    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
    }

    // 메모리 체크 타이머 취소
    if (entry.memCheckTimer) {
      clearInterval(entry.memCheckTimer);
    }

    delete this.lineBuffers[name];
    this.entries.delete(name);
  }

  // 모든 감시 해제
  unwatchAll(): void {
    for (const name of Array.from(this.entries.keys())) {
      this.unwatch(name);
    }
  }

  // 감시 중인 서비스 이름 목록 (테스트용)
  getWatchedNames(): string[] {
    return Array.from(this.entries.keys());
  }

  // ── 내부 구현: file 방식 ───────────────────────────────

  private _watchFile(config: Extract<ServiceConfig, { method: 'file' }>): void {
    const fileWatchers: WatchEntry['fileWatchers'] = [];
    const entry: WatchEntry = { name: config.name, fileWatchers };
    this.entries.set(config.name, entry);

    for (const filePath of config.paths) {
      const absPath = path.resolve(filePath);
      const fw = { filePath: absPath, position: 0, watcher: null as fs.FSWatcher | null };

      try {
        const stat = fs.statSync(absPath);
        fw.position = stat.size;
      } catch {
        fw.position = 0;
      }

      fileWatchers.push(fw);
      this._startFileWatcher(config.name, fw);
    }
  }

  private _startFileWatcher(name: string, fw: NonNullable<WatchEntry['fileWatchers']>[number]): void {
    try {
      const watcher = fs.watch(fw.filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          this._handleFileChange(name, fw);
        }
      });
      watcher.on('error', (err) => this.emit('error', err));
      fw.watcher = watcher;
    } catch {
      fw.watcher = null;
    }
  }

  private _handleFileChange(name: string, fw: NonNullable<WatchEntry['fileWatchers']>[number]): void {
    try {
      const stat = fs.statSync(fw.filePath);

      // 로테이션 감지
      if (stat.size < fw.position) fw.position = 0;
      if (stat.size <= fw.position) return;

      const fd = fs.openSync(fw.filePath, 'r');
      const length = stat.size - fw.position;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, fw.position);
      fs.closeSync(fd);

      fw.position = stat.size;
      this._emitLines(name, buffer.toString('utf8'));
    } catch (err) {
      if (err instanceof Error) this.emit('error', err);
    }
  }

  // ── 내부 구현: exec 방식 ───────────────────────────────

  private _watchExec(config: Extract<ServiceConfig, { method: 'exec' }>): void {
    const restartDelay = config.restartDelay ?? 3000;
    const entry: WatchEntry = { name: config.name, stopped: false, config, restartDelay, restartCount: 0 };
    this.entries.set(config.name, entry);
    this._spawnExec(entry, config.command);
  }

  private _spawnExec(entry: WatchEntry, command: string): void {
    const parts = command.split(/\s+/);
    const bin = parts[0]!;
    const args = parts.slice(1);

    entry.startedAt = new Date();
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    entry.process = child;

    this.emit('status', entry.name, 'running', child.pid, entry.restartCount, entry.startedAt);

    child.stdout?.on('data', (chunk: Buffer) => this._emitLines(entry.name, chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => this._emitLines(entry.name, chunk.toString('utf8')));

    child.on('close', () => {
      if (entry.stopped) return;
      // 메모리 체크 타이머 정리 (프로세스 종료 시)
      if (entry.memCheckTimer) {
        clearInterval(entry.memCheckTimer);
        entry.memCheckTimer = undefined;
      }
      this.emit('status', entry.name, 'stopped', undefined, entry.restartCount, undefined);
      entry.restartCount = (entry.restartCount ?? 0) + 1;
      entry.startedAt = new Date();
      entry.restartTimer = setTimeout(() => {
        if (!entry.stopped) this._spawnExec(entry, command);
      }, entry.restartDelay ?? 3000);
    });

    // 메모리 임계값이 설정된 경우 주기적으로 체크
    const maxMemBytes = (entry.config as Extract<ServiceConfig, { method: 'exec' }>)?.maxMemBytes;
    if (maxMemBytes && maxMemBytes > 0) {
      entry.memCheckTimer = setInterval(async () => {
        if (entry.stopped || !child.pid) return;
        try {
          const stats = await pidusage(child.pid);
          if (stats.memory > maxMemBytes) {
            const mb = (stats.memory / 1024 / 1024).toFixed(1);
            const limitMb = (maxMemBytes / 1024 / 1024).toFixed(0);
            this._emitLines(entry.name, `[ward] 메모리 초과로 재시작: ${mb}MB > ${limitMb}MB 임계값`);
            child.kill('SIGTERM');
          }
        } catch { /* PID 접근 불가 시 무시 */ }
      }, MEM_CHECK_INTERVAL_MS);
    }
  }

  // ── 내부 구현: journal 방식 ────────────────────────────

  private _watchJournal(config: Extract<ServiceConfig, { method: 'journal' }>): void {
    const entry: WatchEntry = { name: config.name, stopped: false };
    this.entries.set(config.name, entry);

    const child = spawn('journalctl', ['-u', config.unit, '-f', '--no-pager'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.process = child;

    child.stdout?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
  }

  // ── 내부 구현: docker 방식 ─────────────────────────────

  private _watchDocker(config: Extract<ServiceConfig, { method: 'docker' }>): void {
    const entry: WatchEntry = { name: config.name, stopped: false };
    this.entries.set(config.name, entry);

    const child = spawn('docker', ['logs', '-f', '--tail=0', config.container], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.process = child;

    child.stdout?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
  }

  // ── 내부 구현: pipe 방식 ───────────────────────────────

  private _watchPipe(config: Extract<ServiceConfig, { method: 'pipe' }>): void {
    const entry: WatchEntry = { name: config.name, stopped: false };
    this.entries.set(config.name, entry);

    const child = spawn('sh', ['-c', config.command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.process = child;

    child.stdout?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => this._emitLines(config.name, chunk.toString('utf8')));
  }

  // 서비스 재시작 (설정을 유지하며 중단 후 재시작)
  restart(name: string): void {
    const entry = this.entries.get(name);
    if (!entry || !entry.config) return;
    const config = entry.config;
    // 재시작 횟수 누적: 기존 횟수 + 1 (수동 재시작도 카운트)
    const nextRestartCount = (entry.restartCount ?? 0) + 1;
    this.unwatch(name);
    setTimeout(() => {
      this.watch(config);
      const newEntry = this.entries.get(name);
      if (newEntry) newEntry.restartCount = nextRestartCount;
    }, 500);
  }

  // 서비스 상태 조회
  getServiceStatus(name: string): { status: 'running' | 'stopped' | 'unknown'; pid?: number; restartCount: number; startedAt?: Date } {
    const entry = this.entries.get(name);
    if (!entry) return { status: 'unknown', restartCount: 0 };
    if (entry.stopped) return { status: 'stopped', restartCount: entry.restartCount ?? 0 };
    if (entry.process) {
      return {
        status: entry.process.exitCode === null ? 'running' : 'stopped',
        pid: entry.process.pid,
        restartCount: entry.restartCount ?? 0,
        startedAt: entry.startedAt,
      };
    }
    // file/journal/docker/pipe: watcher가 있으면 running
    return { status: 'running', restartCount: 0, startedAt: entry.startedAt };
  }

  // ── 공통: 라인 분리 후 이벤트 발생 ───────────────────────

  private _emitLines(name: string, text: string): void {
    // 이전에 미완성된 라인 앞에 붙임
    const buffered = (this.lineBuffers[name] ?? '') + text;
    const lines = buffered.split('\n');

    // 마지막 요소는 개행이 없는 미완성 라인일 수 있음
    this.lineBuffers[name] = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed.length > 0) {
        this.emit('line', name, trimmed);
      }
    }
  }
}
