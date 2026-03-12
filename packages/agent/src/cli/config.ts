import * as readline from 'readline';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  AgentConfigData,
} from '../config/AgentConfig.js';

// 사용자 입력을 받는 헬퍼 함수
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// ward config init - 설정 초기화
export async function configInit(): Promise<void> {
  console.log('Ward 에이전트 설정을 초기화합니다.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const currentConfig = loadConfig();

    const serverUrl = await prompt(
      rl,
      `서버 URL [${currentConfig.server.url}]: `
    );
    const apiKey = await prompt(
      rl,
      `API 키 [${currentConfig.server.apiKey || '없음'}]: `
    );
    const intervalStr = await prompt(
      rl,
      `메트릭 수집 주기(초) [${currentConfig.metrics.interval}]: `
    );

    const config: AgentConfigData = {
      server: {
        url: serverUrl || currentConfig.server.url,
        apiKey: apiKey || currentConfig.server.apiKey,
      },
      metrics: {
        interval: intervalStr
          ? parseInt(intervalStr, 10)
          : currentConfig.metrics.interval,
      },
      logs: currentConfig.logs,
    };

    saveConfig(config);
    console.log(`\n설정이 저장되었습니다: ${getConfigPath()}`);
  } finally {
    rl.close();
  }
}

// ward config show - 현재 설정 출력
export function configShow(): void {
  const config = loadConfig();
  const configPath = getConfigPath();

  console.log(`설정 파일: ${configPath}\n`);
  console.log('현재 설정:');
  console.log(`  서버 URL: ${config.server.url}`);
  console.log(
    `  API 키: ${config.server.apiKey ? '****' + config.server.apiKey.slice(-4) : '미설정'}`
  );
  console.log(`  메트릭 수집 주기: ${config.metrics.interval}초`);

  if (config.logs.length > 0) {
    console.log('  로그 파일:');
    config.logs.forEach((log) => {
      console.log(`    - ${log.path} (${log.type})`);
    });
  } else {
    console.log('  로그 파일: 없음');
  }
}
