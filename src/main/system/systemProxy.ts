import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ProxyCommandOptions = {
  host: string;
  port: number;
  networkServices: string[];
};

export type ProxyCommand = [command: string, args: string[]];

const WINDOWS_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

/** 플랫폼별 시스템 프록시 설정/해제 명령어 목록을 만든다 (테스트 가능한 순수 함수) */
export const buildProxyCommands = (
  platform: string,
  action: 'enable' | 'disable',
  options: ProxyCommandOptions,
): ProxyCommand[] => {
  if (platform === 'darwin') {
    return options.networkServices.flatMap((service): ProxyCommand[] =>
      action === 'enable'
        ? [
            ['networksetup', ['-setwebproxy', service, options.host, String(options.port)]],
            ['networksetup', ['-setsecurewebproxy', service, options.host, String(options.port)]],
          ]
        : [
            ['networksetup', ['-setwebproxystate', service, 'off']],
            ['networksetup', ['-setsecurewebproxystate', service, 'off']],
          ],
    );
  }

  if (platform === 'win32') {
    if (action === 'enable') {
      return [
        [
          'reg',
          ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'],
        ],
        [
          'reg',
          [
            'add',
            WINDOWS_INTERNET_SETTINGS_KEY,
            '/v',
            'ProxyServer',
            '/t',
            'REG_SZ',
            '/d',
            `${options.host}:${options.port}`,
            '/f',
          ],
        ],
      ];
    }
    return [
      [
        'reg',
        ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'],
      ],
    ];
  }

  throw new Error(`지원하지 않는 플랫폼입니다: ${platform}`);
};

/** 시스템 프록시를 실제로 등록/해제한다 */
export class SystemProxyManager {
  private enabled = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  async enable(host: string, port: number): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'enable', { host, port, networkServices });
    for (const [command, args] of commands) {
      await execFileAsync(command, args);
    }
    this.enabled = true;
  }

  async disable(): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'disable', {
      host: '',
      port: 0,
      networkServices,
    });
    for (const [command, args] of commands) {
      await execFileAsync(command, args);
    }
    this.enabled = false;
  }

  /** macOS: 사용 가능한 네트워크 서비스 목록 (비활성 * 표시 제외) */
  private async getActiveNetworkServices(): Promise<string[]> {
    const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices']);
    return stdout
      .split('\n')
      .slice(1) // 첫 줄은 안내 문구
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('*'));
  }
}
