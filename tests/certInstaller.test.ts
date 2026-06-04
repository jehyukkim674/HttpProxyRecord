import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

const shellMock = vi.hoisted(() => ({ openPath: vi.fn() }));
vi.mock('electron', () => ({ shell: shellMock }));

import { installRootCa } from '../src/main/system/certInstaller';

type ExecCb = (err: unknown, result?: { stdout: string }) => void;

describe('installRootCa (darwin)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('성공: osascript로 시스템 키체인에 설치하고 ok=true', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], cb: ExecCb) => cb(null, { stdout: '' }));

    const result = await installRootCa('/path/rootCA.pem');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('키체인');
    const call = execFileMock.mock.calls.find((c) => c[0] === 'osascript');
    expect(call![1][1]).toContain('with administrator privileges');
    expect(call![1][1]).toContain('/path/rootCA.pem');
    expect(shellMock.openPath).not.toHaveBeenCalled();
  });

  it('실패(권한 취소 등): 인증서 파일을 열고 ok=false + 안내', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], cb: ExecCb) =>
      cb(new Error('User canceled.')),
    );

    const result = await installRootCa('/path/rootCA.pem');

    expect(result.ok).toBe(false);
    expect(shellMock.openPath).toHaveBeenCalledWith('/path/rootCA.pem');
    expect(result.message).toContain('수동');
  });
});

describe('installRootCa (플랫폼별)', () => {
  const realPlatform = process.platform;
  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true });

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setPlatform(realPlatform));

  it('Windows: certutil로 사용자 저장소에 추가', async () => {
    setPlatform('win32');
    execFileMock.mockImplementation((_file: string, _args: string[], cb: ExecCb) => cb(null, { stdout: '' }));

    const result = await installRootCa('C:/rootCA.pem');

    expect(result.ok).toBe(true);
    const call = execFileMock.mock.calls.find((c) => c[0] === 'certutil');
    expect(call![1]).toEqual(['-addstore', '-user', 'Root', 'C:/rootCA.pem']);
  });

  it('지원하지 않는 플랫폼: ok=false', async () => {
    setPlatform('linux');
    const result = await installRootCa('/x');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('지원하지 않는');
  });
});
