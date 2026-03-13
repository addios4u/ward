#!/usr/bin/env node
// Ward 에이전트 CLI 진입점
import { Command } from 'commander';
import { start } from './cli/start.js';
import { stop } from './cli/stop.js';
import { status } from './cli/status.js';
import { configShow } from './cli/config.js';
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

program.parse(process.argv);
