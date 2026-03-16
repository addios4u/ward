import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// 로그 파일 감시 이벤트 타입
export interface LogWatcherEvents {
  line: (source: string, line: string) => void;
  error: (err: Error) => void;
}

// 감시 대상 파일 상태
interface WatchedFile {
  filePath: string;
  source: string;
  position: number;   // 현재 읽기 위치 (파일 포인터)
  watcher: fs.FSWatcher | null;
}

// fs.watch + 파일 포인터 방식으로 tail -f 구현
export class LogWatcher extends EventEmitter {
  private watchedFiles: Map<string, WatchedFile> = new Map();

  // 로그 파일 감시 등록
  watch(filePath: string, source: string): void {
    const absPath = path.resolve(filePath);

    if (this.watchedFiles.has(absPath)) {
      return; // 이미 감시 중
    }

    const entry: WatchedFile = {
      filePath: absPath,
      source,
      position: 0,
      watcher: null,
    };

    // 파일이 존재하면 끝 위치부터 읽기 시작 (기존 내용 무시)
    try {
      const stat = fs.statSync(absPath);
      entry.position = stat.size;
    } catch {
      // 파일이 없으면 0부터 시작 (파일 생성 대기)
      entry.position = 0;
    }

    this.watchedFiles.set(absPath, entry);
    this._startWatcher(entry);
  }

  // 특정 파일 감시 중단
  unwatch(filePath: string): void {
    const absPath = path.resolve(filePath);
    const entry = this.watchedFiles.get(absPath);
    if (entry) {
      entry.watcher?.close();
      this.watchedFiles.delete(absPath);
    }
  }

  // 모든 감시 중단
  unwatchAll(): void {
    for (const [, entry] of this.watchedFiles) {
      entry.watcher?.close();
    }
    this.watchedFiles.clear();
  }

  // 내부: fs.FSWatcher 시작
  private _startWatcher(entry: WatchedFile): void {
    try {
      const watcher = fs.watch(entry.filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          this._handleFileChange(entry);
        }
      });

      watcher.on('error', (err) => {
        this.emit('error', err);
      });

      entry.watcher = watcher;
    } catch {
      // 파일이 없으면 감시를 시작할 수 없음 — 정상 상황
      entry.watcher = null;
    }
  }

  // 내부: 파일 변경 처리
  private _handleFileChange(entry: WatchedFile): void {
    try {
      const stat = fs.statSync(entry.filePath);

      // 파일 로테이션 감지: 파일 크기가 현재 포인터보다 작아지면 처음부터 다시 읽기
      if (stat.size < entry.position) {
        entry.position = 0;
      }

      if (stat.size <= entry.position) {
        return; // 새 내용 없음
      }

      // 새로 추가된 부분만 읽기
      const fd = fs.openSync(entry.filePath, 'r');
      const length = stat.size - entry.position;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, entry.position);
      fs.closeSync(fd);

      entry.position = stat.size;

      // 라인 단위로 분리하여 이벤트 발생
      const text = buffer.toString('utf8');
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed.length > 0) {
          this.emit('line', entry.source, trimmed);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        this.emit('error', err);
      }
    }
  }

  // 감시 중인 파일 목록 반환 (테스트용)
  getWatchedSources(): string[] {
    return Array.from(this.watchedFiles.values()).map((e) => e.source);
  }
}
