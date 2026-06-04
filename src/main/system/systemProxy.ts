import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '../logger';

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

export type ProxyExec = (command: string, args: string[]) => Promise<void>;

export type ProxyRunResult = {
  /** 성공한 명령 수 */
  applied: number;
  /** 실패한 명령 (예: 프록시를 지원하지 않는 가상 네트워크 서비스) */
  failures: Array<{ command: ProxyCommand; error: Error }>;
};

/**
 * 명령들을 순서대로 실행하되 개별 실패는 모아서 반환한다(중단하지 않음).
 *
 * macOS는 `networksetup -listallnetworkservices`에 LG 모니터 USB 제어 인터페이스 같은
 * 비-네트워크 서비스도 섞여 나오는데, 이런 서비스에 `-setwebproxy`를 걸면 비정상 종료한다.
 * 하나가 실패했다고 전체를 중단하면 정작 Wi-Fi/이더넷에 프록시가 적용되지 않으므로,
 * 실패는 모아두고 나머지 서비스에는 계속 적용한다. (테스트 가능한 순수 로직 — exec 주입)
 */
export const runProxyCommands = async (
  commands: ProxyCommand[],
  exec: ProxyExec,
): Promise<ProxyRunResult> => {
  let applied = 0;
  const failures: ProxyRunResult['failures'] = [];
  for (const [command, args] of commands) {
    try {
      await exec(command, args);
      applied += 1;
    } catch (error) {
      failures.push({
        command: [command, args],
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return { applied, failures };
};

/** 셸 인자를 작은따옴표로 감싸 안전하게 만든다 (공백 든 서비스명 등). */
const shellQuote = (arg: string): string => `'${arg.replace(/'/g, "'\\''")}'`;

/**
 * macOS networksetup 명령들을 하나의 셸 스크립트로 합친다. (순수·테스트 가능)
 *
 * networksetup의 프록시 변경은 관리자 권한이 필요해 osascript의
 * `do shell script ... with administrator privileges`로 한 번만 승격 실행한다.
 * 끝에 `; true`를 붙여, 프록시를 지원하지 않는 일부 서비스가 실패해도(예: LG 모니터 USB
 * 제어 인터페이스) 전체 스크립트는 0으로 종료되게 한다 — 실제 Wi-Fi/이더넷에는 적용된다.
 */
export const buildMacProxyScript = (commands: ProxyCommand[]): string =>
  `${commands.map(([command, args]) => [command, ...args].map(shellQuote).join(' ')).join('; ')}; true`;

/** 시스템 프록시를 실제로 등록/해제한다 */
export class SystemProxyManager {
  private enabled = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  async enable(host: string, port: number): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'enable', { host, port, networkServices });
    await this.run('시스템 프록시 등록', commands);
    this.enabled = true;
  }

  async disable(): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'disable', {
      host: '',
      port: 0,
      networkServices,
    });
    await this.run('시스템 프록시 해제', commands);
    this.enabled = false;
  }

  /**
   * 명령들을 적용한다.
   * - macOS: networksetup이 관리자 권한을 요구하므로 osascript로 한 번 승격해 전체를 실행한다.
   *   (사용자가 권한 프롬프트를 취소하면 에러를 던진다)
   * - 그 외(Windows 등): 권한이 필요 없어 개별 실행하고, 일부 실패는 건너뛴다.
   */
  private async run(action: string, commands: ProxyCommand[]): Promise<void> {
    if (commands.length === 0) return;

    if (process.platform === 'darwin') {
      await this.runElevated(action, commands);
      return;
    }

    const { applied, failures } = await runProxyCommands(commands, (command, args) =>
      execFileAsync(command, args).then(() => undefined),
    );
    for (const { command, error } of failures) {
      log.warn(`${action}: 일부 명령 실패(건너뜀)`, {
        command: [command[0], ...command[1]].join(' '),
        message: error.message,
      });
    }
    if (applied === 0) {
      throw new Error(`${action} 실패: ${failures[0]?.error.message ?? '적용된 항목이 없습니다'}`);
    }
  }

  /** macOS: networksetup 명령들을 관리자 권한으로 한 번에 실행한다 (네이티브 암호 프롬프트). */
  private async runElevated(action: string, commands: ProxyCommand[]): Promise<void> {
    const script = buildMacProxyScript(commands);
    try {
      await execFileAsync('osascript', [
        '-e',
        `do shell script ${JSON.stringify(script)} with administrator privileges`,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('-128') || message.toLowerCase().includes('cancel')) {
        throw new Error(`${action}이(가) 취소되었습니다 — 관리자 권한이 필요합니다`);
      }
      throw new Error(`${action} 실패: ${message}`);
    }
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
