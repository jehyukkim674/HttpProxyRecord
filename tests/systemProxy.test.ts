import { describe, expect, it } from 'vitest';
import { buildMacProxyScript, buildProxyCommands, runProxyCommands } from '../src/main/system/systemProxy';

describe('buildProxyCommands', () => {
  it('macOS 활성화 명령을 네트워크 서비스별로 만든다', () => {
    const commands = buildProxyCommands('darwin', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['Wi-Fi', 'Thunderbolt Ethernet'],
    });

    expect(commands).toEqual([
      ['networksetup', ['-setwebproxy', 'Wi-Fi', '127.0.0.1', '8888']],
      ['networksetup', ['-setsecurewebproxy', 'Wi-Fi', '127.0.0.1', '8888']],
      ['networksetup', ['-setwebproxy', 'Thunderbolt Ethernet', '127.0.0.1', '8888']],
      ['networksetup', ['-setsecurewebproxy', 'Thunderbolt Ethernet', '127.0.0.1', '8888']],
    ]);
  });

  it('macOS 비활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('darwin', 'disable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['Wi-Fi'],
    });

    expect(commands).toEqual([
      ['networksetup', ['-setwebproxystate', 'Wi-Fi', 'off']],
      ['networksetup', ['-setsecurewebproxystate', 'Wi-Fi', 'off']],
    ]);
  });

  it('Windows 활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('win32', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: [],
    });

    expect(commands).toEqual([
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyEnable',
          '/t',
          'REG_DWORD',
          '/d',
          '1',
          '/f',
        ],
      ],
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyServer',
          '/t',
          'REG_SZ',
          '/d',
          '127.0.0.1:8888',
          '/f',
        ],
      ],
    ]);
  });

  it('Windows 비활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('win32', 'disable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: [],
    });

    expect(commands).toEqual([
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyEnable',
          '/t',
          'REG_DWORD',
          '/d',
          '0',
          '/f',
        ],
      ],
    ]);
  });

  it('지원하지 않는 플랫폼이면 에러를 던진다', () => {
    expect(() =>
      buildProxyCommands('linux', 'enable', { host: '127.0.0.1', port: 8888, networkServices: [] }),
    ).toThrow('지원하지 않는 플랫폼입니다: linux');
  });
});

describe('runProxyCommands', () => {
  it('프록시 설정을 거부하는 서비스(예: LG Monitor Controls)가 있어도 나머지에 계속 적용한다', async () => {
    const attempted: string[] = [];
    const exec = async (_command: string, args: string[]): Promise<void> => {
      attempted.push(args.join(' '));
      // LG Monitor Controls 같은 비-네트워크 서비스는 networksetup이 비정상 종료한다
      if (args.includes('LG Monitor Controls')) {
        throw new Error('** Error: The parameters were not valid.');
      }
    };
    const commands = buildProxyCommands('darwin', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['LG Monitor Controls', 'Wi-Fi'],
    });

    const result = await runProxyCommands(commands, exec);

    expect(attempted).toHaveLength(4); // 실패해도 4개 명령 전부 시도
    expect(result.applied).toBe(2); // Wi-Fi 2개 성공
    expect(result.failures).toHaveLength(2); // LG 2개 실패 — 수집만 하고 중단하지 않음
    expect(result.failures[0].error.message).toContain('parameters were not valid');
  });

  it('모든 명령이 성공하면 실패가 없다', async () => {
    const commands = buildProxyCommands('darwin', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['Wi-Fi'],
    });

    const result = await runProxyCommands(commands, async () => {});

    expect(result.applied).toBe(2);
    expect(result.failures).toEqual([]);
  });
});

describe('buildMacProxyScript', () => {
  it('공백 든 서비스명을 따옴표로 감싸 한 줄 스크립트로 합치고 끝에 ; true를 붙인다', () => {
    const commands = buildProxyCommands('darwin', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['LG Monitor Controls', 'Wi-Fi'],
    });

    const script = buildMacProxyScript(commands);

    // 공백 든 서비스명이 안전하게 인용됨 (osascript do shell script로 root 실행)
    expect(script).toContain("'networksetup' '-setwebproxy' 'LG Monitor Controls' '127.0.0.1' '8888'");
    expect(script).toContain("'networksetup' '-setwebproxy' 'Wi-Fi' '127.0.0.1' '8888'");
    // 일부 서비스 실패해도 전체 종료코드 0이 되도록
    expect(script.endsWith('; true')).toBe(true);
    // 명령들은 ;로 연결
    expect(script).toContain('; ');
  });

  it('작은따옴표가 든 서비스명을 이스케이프한다', () => {
    const commands = buildProxyCommands('darwin', 'disable', {
      host: '',
      port: 0,
      networkServices: ["Bob's Wi-Fi"],
    });

    const script = buildMacProxyScript(commands);

    expect(script).toContain("'Bob'\\''s Wi-Fi'");
  });
});
