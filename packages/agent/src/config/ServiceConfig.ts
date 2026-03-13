// 서비스 로그 수집 방식별 설정 타입

export type ServiceMethod = 'file' | 'exec' | 'journal' | 'docker' | 'pipe';

// file 방식: 지정 경로의 파일을 tail -f 방식으로 감시
export interface FileServiceConfig {
  name: string;
  method: 'file';
  paths: string[];       // 감시할 파일 경로 목록
}

// exec 방식: 명령어를 직접 실행하고 stdout/stderr 수집
export interface ExecServiceConfig {
  name: string;
  method: 'exec';
  command: string;       // 실행할 명령어 (예: "node app.js")
  restartDelay?: number; // 종료 후 재시작 딜레이(ms), 기본값: 3000
}

// journal 방식: journalctl -u <unit> -f 로 systemd 서비스 로그 수집
export interface JournalServiceConfig {
  name: string;
  method: 'journal';
  unit: string;          // systemd 서비스 유닛명 (예: "nginx.service")
}

// docker 방식: docker logs -f <container> 로 컨테이너 로그 수집
export interface DockerServiceConfig {
  name: string;
  method: 'docker';
  container: string;     // 컨테이너 이름 또는 ID
}

// pipe 방식: sh -c "<command>" 로 파이프 포함 명령 실행
export interface PipeServiceConfig {
  name: string;
  method: 'pipe';
  command: string;       // 파이프 포함 쉘 명령어 (예: "cat /var/log/syslog | grep ERROR")
}

export type ServiceConfig =
  | FileServiceConfig
  | ExecServiceConfig
  | JournalServiceConfig
  | DockerServiceConfig
  | PipeServiceConfig;
