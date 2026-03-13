import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SERVICE_PATH = '/etc/systemd/system/ward-agent.service';

// Linux 전용: systemd 서비스 등록
export async function setupSystemd(serverUrl: string, groupName?: string): Promise<void> {
  const nameArg = groupName ? ` --name "${groupName}"` : '';
  const serviceContent = `[Unit]
Description=Ward Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${process.argv[1]} start ${serverUrl}${nameArg}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

  try {
    fs.writeFileSync(SERVICE_PATH, serviceContent, 'utf-8');
    await execAsync('systemctl enable ward-agent');
    await execAsync('systemctl start ward-agent');
    console.log('systemd 서비스가 등록되었습니다.');
  } catch (error) {
    // 권한 없음 등 실패는 경고만 출력
    console.warn('systemd 서비스 등록 실패 (root 권한 필요):', error instanceof Error ? error.message : error);
  }
}

// Linux 전용: systemd 서비스 제거
export async function removeSystemd(): Promise<void> {
  try {
    await execAsync('systemctl stop ward-agent').catch(() => {});
    await execAsync('systemctl disable ward-agent').catch(() => {});
    if (fs.existsSync(SERVICE_PATH)) {
      fs.unlinkSync(SERVICE_PATH);
    }
    console.log('systemd 서비스가 제거되었습니다.');
  } catch (error) {
    console.warn('systemd 서비스 제거 실패:', error instanceof Error ? error.message : error);
  }
}
