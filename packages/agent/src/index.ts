#!/usr/bin/env node
// Ward 에이전트 CLI 진입점
import { Command } from 'commander';
import { start } from './cli/start.js';
import { stop } from './cli/stop.js';
import { status } from './cli/status.js';
import { configInit, configShow } from './cli/config.js';

const program = new Command();

program
  .name('ward')
  .description('Ward 서버 모니터링 에이전트')
  .version('0.1.0');

// ward start - 에이전트 시작
program
  .command('start')
  .description('에이전트를 백그라운드 데몬으로 시작합니다')
  .action(async () => {
    await start();
  });

// ward stop - 에이전트 중지
program
  .command('stop')
  .description('실행 중인 에이전트를 중지합니다')
  .action(() => {
    stop();
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
  .command('init')
  .description('설정을 초기화합니다 (서버 URL, API 키 입력)')
  .action(async () => {
    await configInit();
  });

configCmd
  .command('show')
  .description('현재 설정을 출력합니다')
  .action(() => {
    configShow();
  });

program.parse(process.argv);
