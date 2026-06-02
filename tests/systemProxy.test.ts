import { describe, expect, it } from 'vitest';
import { buildProxyCommands } from '../src/main/system/systemProxy';

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
