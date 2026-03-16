import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SERVICE_NAME = 'ward-agent.service';

// user-level systemd 서비스 경로 (~/.config/systemd/user/)
function getUserServicePath(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user', SERVICE_NAME);
}

// Linux 전용: systemd user 서비스 등록 (root 권한 불필요)
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
WantedBy=default.target
`;

  try {
    const servicePath = getUserServicePath();
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, serviceContent, 'utf-8');
    await execAsync('systemctl --user daemon-reload');
    await execAsync('systemctl --user enable ward-agent');
    await execAsync('systemctl --user start ward-agent');
    console.log('systemd user 서비스가 등록되었습니다. (재부팅 후 자동 시작)');
  } catch (error) {
    console.warn('systemd 서비스 등록 실패:', error instanceof Error ? error.message : error);
  }
}

// Linux 전용: systemd user 서비스 제거
export async function removeSystemd(): Promise<void> {
  try {
    await execAsync('systemctl --user stop ward-agent').catch(() => {});
    await execAsync('systemctl --user disable ward-agent').catch(() => {});
    const servicePath = getUserServicePath();
    if (fs.existsSync(servicePath)) {
      fs.unlinkSync(servicePath);
    }
    await execAsync('systemctl --user daemon-reload').catch(() => {});
    console.log('systemd 서비스가 제거되었습니다.');
  } catch (error) {
    console.warn('systemd 서비스 제거 실패:', error instanceof Error ? error.message : error);
  }
}
