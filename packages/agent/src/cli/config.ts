import {
  loadConfig,
  getConfigPath,
} from '../config/AgentConfig.js';

// ward config show - 현재 설정 출력
export function configShow(): void {
  const config = loadConfig();
  const configPath = getConfigPath();

  console.log(`설정 파일: ${configPath}\n`);

  if (!config) {
    console.log('설정 파일이 없습니다. `ward start <서버 URL>`로 에이전트를 시작하세요.');
    return;
  }

  console.log('현재 설정:');
  console.log(`  서버 URL: ${config.server.url}`);
  if (config.server.groupName) {
    console.log(`  그룹명: ${config.server.groupName}`);
  }
  console.log(`  메트릭 수집 주기: ${config.metrics.interval}초`);

  if (config.services.length > 0) {
    console.log('  등록 서비스:');
    config.services.forEach((svc) => {
      console.log(`    - ${svc.name} (${svc.method})`);
    });
  } else {
    console.log('  등록 서비스: 없음');
  }
}
