import { beforeEach, describe, expect, it, vi } from 'vitest';

const appMock = vi.hoisted(() => ({ isPackaged: false, getVersion: vi.fn(() => '0.1.3'), quit: vi.fn() }));
const shellMock = vi.hoisted(() => ({ openExternal: vi.fn().mockResolvedValue(undefined) }));
vi.mock('electron', () => ({ app: appMock, shell: shellMock }));

const autoUpdaterMock = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  once: vi.fn(),
}));
vi.mock('electron-updater', () => ({ autoUpdater: autoUpdaterMock }));

const applyMacUpdateMock = vi.hoisted(() => vi.fn());
vi.mock('../src/main/system/macUpdater', () => ({ applyMacUpdate: applyMacUpdateMock }));

import { UpdateManager } from '../src/main/system/updater';

describe('UpdateManager.check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appMock.isPackaged = false;
    appMock.getVersion.mockReturnValue('0.1.3');
  });

  it('개발 모드(미패키징)에선 확인하지 않고 latest', async () => {
    const result = await new UpdateManager().check();
    expect(result).toEqual({ kind: 'latest' });
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
  });

  it('패키징 + 새 버전: available (notes 정리 포함)', async () => {
    appMock.isPackaged = true;
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '0.2.0', releaseNotes: '<p>새 기능</p>' },
    });
    const result = await new UpdateManager().check();
    expect(result).toMatchObject({ kind: 'available', version: '0.2.0', notes: '새 기능' });
    expect(autoUpdaterMock.autoDownload).toBe(false); // 확인만 — 자동 다운로드 끔
  });

  it('패키징 + 동일 버전: latest', async () => {
    appMock.isPackaged = true;
    autoUpdaterMock.checkForUpdates.mockResolvedValue({ updateInfo: { version: '0.1.3' } });
    expect(await new UpdateManager().check()).toEqual({ kind: 'latest' });
  });

  it('확인 중 예외: error 상태로 메시지를 담는다', async () => {
    appMock.isPackaged = true;
    autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error('네트워크 끊김'));
    expect(await new UpdateManager().check()).toEqual({ kind: 'error', message: '네트워크 끊김' });
  });
});

describe('UpdateManager.install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appMock.isPackaged = false;
  });

  it('개발 모드: 릴리스 페이지를 연다', async () => {
    await new UpdateManager().install();
    expect(shellMock.openExternal).toHaveBeenCalledWith(expect.stringContaining('releases/latest'));
  });

  it('macOS 패키징: 자가 업데이터를 호출한다(릴리스 페이지 안 엶)', async () => {
    appMock.isPackaged = true;
    applyMacUpdateMock.mockResolvedValue(undefined);
    await new UpdateManager().install();
    expect(applyMacUpdateMock).toHaveBeenCalled();
    expect(shellMock.openExternal).not.toHaveBeenCalled();
  });

  it('macOS 자가 업데이트 실패: 릴리스 페이지로 폴백하고 에러 전파', async () => {
    appMock.isPackaged = true;
    applyMacUpdateMock.mockRejectedValue(new Error('교체 실패'));
    await expect(new UpdateManager().install()).rejects.toThrow('교체 실패');
    expect(shellMock.openExternal).toHaveBeenCalled();
  });
});
