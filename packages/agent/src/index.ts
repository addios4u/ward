#!/usr/bin/env node
// Ward 에이전트 CLI 진입점
import { Command } from 'commander';
import { start } from './cli/start.js';
import { stop } from './cli/stop.js';
import { status } from './cli/status.js';
import { configShow } from './cli/config.js';
import { serviceAdd, serviceRemove, serviceList } from './cli/service.js';
import { pipe } from './cli/pipe.js';
import { loadConfig } from './config/AgentConfig.js';

const program = new Command();

program
  .name('ward')
  .description('Ward 서버 모니터링 에이전트')
  .version('0.1.0');

// ward start [serverUrl] - 에이전트 시작
program
  .command('start [serverUrl]')
  .description('에이전트를 시작합니다. 처음 실행 시 서버 URL을 지정하세요.')
  .option('--name <groupName>', '서버 그룹명 (클러스터 환경에서 서버를 그룹화)')
  .action(async (serverUrl?: string, options?: { name?: string }) => {
    if (!serverUrl) {
      // 기존 config에서 URL 로드
      const config = loadConfig();
      if (!config?.server?.url) {
        console.error('서버 URL이 필요합니다. 예: ward start https://ward.example.com');
        process.exit(1);
      }
      serverUrl = config.server.url;
    }
    await start(serverUrl, options ?? {});
  });

// ward stop - 에이전트 중지
program
  .command('stop')
  .description('에이전트를 중지하고 서버에서 등록을 해제합니다')
  .action(async () => {
    await stop();
  });

// ward status - 에이전트 상태 확인
program
  .command('status')
  .description('에이전트 실행 상태를 확인합니다')
  .action(() => {
    status();
  });

// ward config - 설정 관리
const configCmd = program
  .command('config')
  .description('에이전트 설정을 관리합니다');

configCmd
  .command('show')
  .description('현재 설정을 출력합니다')
  .action(() => {
    configShow();
  });

// ward service - 로그 수집 서비스 관리
const serviceCmd = program
  .command('service')
  .description('로그 수집 서비스 관리');

serviceCmd
  .command('add <name>')
  .description('로그 수집 서비스 등록')
  .option('--log <path>', '감시할 로그 파일 경로 (여러 번 사용 가능)',
    (v: string, prev: string[]) => [...(prev ?? []), v], [] as string[])
  .option('--exec <command>', '실행할 명령어 (stdout/stderr 수집)')
  .option('--cwd <dir>', '명령어 실행 디렉토리 (--exec와 함께 사용)')
  .option('--journal <unit>', 'systemd 유닛 이름 (예: nginx.service)')
  .option('--docker <container>', '도커 컨테이너 이름')
  .action(async (name: string, options: { log?: string[]; exec?: string; cwd?: string; journal?: string; docker?: string }) => {
    await serviceAdd(name, options);
  });

serviceCmd
  .command('remove <name>')
  .description('서비스 제거')
  .action((name: string) => {
    serviceRemove(name);
  });

serviceCmd
  .command('list')
  .description('등록된 서비스 목록')
  .action(() => {
    serviceList();
  });

// ward pipe <name> - stdin을 로그로 전송
program
  .command('pipe <serviceName>')
  .description('stdin을 지정한 서비스 이름으로 로그 전송\n예: node app.js 2>&1 | ward pipe my-api')
  .action(async (serviceName: string) => {
    await pipe(serviceName);
  });

program.parse(process.argv);
