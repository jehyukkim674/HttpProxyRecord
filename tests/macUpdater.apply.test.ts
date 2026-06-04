import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn(() => ({ unref: vi.fn() })));
vi.mock('node:child_process', () => ({ execFile: execFileMock, spawn: spawnMock }));

const fsMock = vi.hoisted(() => ({
  mkdtempSync: vi.fn(() => '/tmp/hpr-update-x'),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => ['HttpProxyRecord.app']),
}));
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

import { applyMacUpdate, sha512Base64 } from '../src/main/system/macUpdater';

const ZIP = Buffer.from('fake-zip-bytes-arm64');
const ZIP_AB = new Uint8Array(ZIP).buffer;
const ZIP_SHA = sha512Base64(ZIP);

const ymlWith = (sha: string, url = 'HttpProxyRecord-0.1.4-arm64-mac.zip'): string =>
  `version: 0.1.4\nfiles:\n  - url: ${url}\n    sha512: ${sha}\n    size: ${ZIP.length}\npath: ${url}\nsha512: ${sha}\n`;

const makeFetch = (yml: string, zipOk = true) =>
  vi.fn(async (url: string) => {
    if (String(url).endsWith('.yml')) {
      return { ok: true, status: 200, text: async () => yml } as unknown as Response;
    }
    if (!zipOk) return { ok: false, status: 404 } as unknown as Response;
    return { ok: true, status: 200, arrayBuffer: async () => ZIP_AB } as unknown as Response;
  });

describe('applyMacUpdate', () => {
  const realExecPath = process.execPath;
  const realArch = process.arch;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'execPath', {
      value: '/Applications/HttpProxyRecord.app/Contents/MacOS/HttpProxyRecord',
      configurable: true,
    });
    Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
    execFileMock.mockImplementation((_file: string, _args: string[], cb: (e: unknown, r?: unknown) => void) =>
      cb(null, { stdout: '' }),
    );
    fsMock.readdirSync.mockReturnValue(['HttpProxyRecord.app']);
  });

  afterEach(() => {
    Object.defineProperty(process, 'execPath', { value: realExecPath, configurable: true });
    Object.defineProperty(process, 'arch', { value: realArch, configurable: true });
    vi.unstubAllGlobals();
  });

  it('정상: zip 다운로드·sha512 검증·ditto 해제 후 스왑 스크립트를 spawn한다', async () => {
    vi.stubGlobal('fetch', makeFetch(ymlWith(ZIP_SHA)));

    await expect(applyMacUpdate()).resolves.toBeUndefined();

    // ditto로 압축 해제
    const ditto = execFileMock.mock.calls.find((c) => c[0] === '/usr/bin/ditto');
    expect(ditto).toBeTruthy();
    // detached 스왑 스크립트 spawn
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/sh',
      ['-c', expect.any(String)],
      expect.objectContaining({ detached: true }),
    );
    const spawnArgs = spawnMock.mock.calls[0] as unknown as [string, string[], unknown];
    const script = spawnArgs[1][1];
    expect(script).toContain('/Applications/HttpProxyRecord.app');
    expect(script).toContain('open "/Applications/HttpProxyRecord.app"');
  });

  it('sha512 불일치: 무결성 검증 실패로 던지고 spawn하지 않는다', async () => {
    vi.stubGlobal('fetch', makeFetch(ymlWith('WRONGSHA==')));
    await expect(applyMacUpdate()).rejects.toThrow('무결성 검증 실패');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('현재 아키텍처에 맞는 빌드가 없으면 던진다', async () => {
    // arm64인데 x64(=arm64 미포함) 파일만 제공
    vi.stubGlobal('fetch', makeFetch(ymlWith(ZIP_SHA, 'HttpProxyRecord-0.1.4-mac.zip')));
    await expect(applyMacUpdate()).rejects.toThrow('맞는 macOS 빌드');
  });

  it('zip 다운로드 실패(404)면 던진다', async () => {
    vi.stubGlobal('fetch', makeFetch(ymlWith(ZIP_SHA), false));
    await expect(applyMacUpdate()).rejects.toThrow('다운로드 실패');
  });

  it('압축 해제 결과에 .app이 없으면 던진다', async () => {
    vi.stubGlobal('fetch', makeFetch(ymlWith(ZIP_SHA)));
    fsMock.readdirSync.mockReturnValue(['readme.txt']);
    await expect(applyMacUpdate()).rejects.toThrow('.app 번들');
  });
});
