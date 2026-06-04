import { beforeEach, describe, expect, it, vi } from 'vitest';

const osMock = vi.hoisted(() => ({ networkInterfaces: vi.fn() }));
vi.mock('node:os', () => ({ default: osMock, ...osMock }));

const qrMock = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock('qrcode', () => ({ default: qrMock, ...qrMock }));

import { buildPairingQr, findLanIp } from '../src/main/system/mobilePairing';

describe('findLanIp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('내부(loopback)·IPv6를 건너뛰고 첫 외부 IPv4를 반환한다', () => {
    osMock.networkInterfaces.mockReturnValue({
      lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      en0: [
        { family: 'IPv6', internal: false, address: 'fe80::1' },
        { family: 'IPv4', internal: false, address: '192.168.0.5' },
      ],
    });
    expect(findLanIp()).toBe('192.168.0.5');
  });

  it('외부 IPv4가 없으면 null', () => {
    osMock.networkInterfaces.mockReturnValue({
      lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    });
    expect(findLanIp()).toBeNull();
  });
});

describe('buildPairingQr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('IP가 있으면 QR data URL과 안내를 만든다', async () => {
    osMock.networkInterfaces.mockReturnValue({
      en0: [{ family: 'IPv4', internal: false, address: '10.0.0.2' }],
    });
    qrMock.toDataURL.mockResolvedValue('data:image/png;base64,AAA');

    const result = await buildPairingQr(8888);

    expect(qrMock.toDataURL).toHaveBeenCalledWith('proxy=10.0.0.2:8888', { width: 240 });
    expect(result).toMatchObject({ ip: '10.0.0.2', port: 8888, dataUrl: 'data:image/png;base64,AAA' });
    expect(result.guide).toContain('10.0.0.2:8888');
  });

  it('IP가 없으면 dataUrl=null + 연결 확인 안내', async () => {
    osMock.networkInterfaces.mockReturnValue({});
    const result = await buildPairingQr(8888);
    expect(result.dataUrl).toBeNull();
    expect(result.ip).toBeNull();
    expect(result.guide).toContain('LAN IP');
    expect(qrMock.toDataURL).not.toHaveBeenCalled();
  });
});
