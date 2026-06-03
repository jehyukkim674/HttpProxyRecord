// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemProxy } from './useSystemProxy';

const ipcMock = vi.hoisted(() => ({
  enableSystemProxy: vi.fn(),
  disableSystemProxy: vi.fn(),
  installCert: vi.fn(),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

type MessageApi = Parameters<typeof useSystemProxy>[0];
const fakeMessage = () =>
  ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }) as unknown as MessageApi;

describe('useSystemProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggle(true) 성공: enabled=true, success 메시지', async () => {
    ipcMock.enableSystemProxy.mockResolvedValue({ enabled: true });
    const message = fakeMessage();
    const { result } = renderHook(() => useSystemProxy(message));

    await act(async () => {
      await result.current.toggle(true);
    });

    expect(ipcMock.enableSystemProxy).toHaveBeenCalled();
    expect(result.current.enabled).toBe(true);
    expect(message.success).toHaveBeenCalled();
  });

  it('toggle(false): enabled=false, info 메시지', async () => {
    ipcMock.disableSystemProxy.mockResolvedValue({ enabled: false });
    const message = fakeMessage();
    const { result } = renderHook(() => useSystemProxy(message));

    await act(async () => {
      await result.current.toggle(false);
    });

    expect(ipcMock.disableSystemProxy).toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(message.info).toHaveBeenCalled();
  });

  it('toggle 실패: error 메시지, enabled는 false 유지', async () => {
    ipcMock.enableSystemProxy.mockRejectedValue(new Error('권한 거부'));
    const message = fakeMessage();
    const { result } = renderHook(() => useSystemProxy(message));

    await act(async () => {
      await result.current.toggle(true);
    });

    expect(message.error).toHaveBeenCalledWith('권한 거부');
    expect(result.current.enabled).toBe(false);
  });

  it('installCert: ok면 success, 아니면 warning', async () => {
    ipcMock.installCert.mockResolvedValueOnce({ ok: true, message: '설치됨' });
    const message = fakeMessage();
    const { result } = renderHook(() => useSystemProxy(message));

    await act(async () => {
      await result.current.installCert();
    });
    expect(message.success).toHaveBeenCalledWith('설치됨');

    ipcMock.installCert.mockResolvedValueOnce({ ok: false, message: '취소됨' });
    await act(async () => {
      await result.current.installCert();
    });
    expect(message.warning).toHaveBeenCalledWith('취소됨');
  });
});
