// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdate } from './useUpdate';

const ipcMock = vi.hoisted(() => ({ checkUpdate: vi.fn(), installUpdate: vi.fn() }));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

type MessageApi = Parameters<typeof useUpdate>[0];
const fakeMessage = () =>
  ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }) as unknown as MessageApi;

describe('useUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.checkUpdate.mockResolvedValue({ kind: 'latest' });
  });

  it('시작 시 자동 확인 — 최신이면 배너 없음, 메시지도 없음', async () => {
    const message = fakeMessage();
    const { result } = renderHook(() => useUpdate(message));
    await waitFor(() => expect(ipcMock.checkUpdate).toHaveBeenCalled());
    expect(result.current.available).toBeNull();
    expect(message.success).not.toHaveBeenCalled(); // 자동 확인은 조용히
  });

  it('새 버전이 있으면 배너 상태를 채운다', async () => {
    ipcMock.checkUpdate.mockResolvedValue({
      kind: 'available',
      version: '0.2.0',
      notes: '새 기능',
      canAutoInstall: true,
    });
    const { result } = renderHook(() => useUpdate(fakeMessage()));
    await waitFor(() => expect(result.current.available?.version).toBe('0.2.0'));
  });

  it('수동 check: 최신이면 success 메시지', async () => {
    const message = fakeMessage();
    const { result } = renderHook(() => useUpdate(message));
    await waitFor(() => expect(ipcMock.checkUpdate).toHaveBeenCalled());

    await act(async () => {
      await result.current.check();
    });
    expect(message.success).toHaveBeenCalledWith('최신 버전입니다');
  });

  it('수동 check 실패: error 메시지', async () => {
    const message = fakeMessage();
    const { result } = renderHook(() => useUpdate(message));
    await waitFor(() => expect(ipcMock.checkUpdate).toHaveBeenCalled());

    ipcMock.checkUpdate.mockRejectedValueOnce(new Error('네트워크'));
    await act(async () => {
      await result.current.check();
    });
    expect(message.error).toHaveBeenCalled();
  });

  it('install: 자동설치 불가면 안내 메시지', async () => {
    ipcMock.checkUpdate.mockResolvedValue({
      kind: 'available',
      version: '0.2.0',
      canAutoInstall: false,
    });
    ipcMock.installUpdate.mockResolvedValue(undefined);
    const message = fakeMessage();
    const { result } = renderHook(() => useUpdate(message));
    await waitFor(() => expect(result.current.available).not.toBeNull());

    await act(async () => {
      await result.current.install();
    });
    expect(ipcMock.installUpdate).toHaveBeenCalled();
    expect(message.info).toHaveBeenCalled();
  });

  it('dismiss는 배너를 닫는다', async () => {
    ipcMock.checkUpdate.mockResolvedValue({ kind: 'available', version: '0.2.0', canAutoInstall: true });
    const { result } = renderHook(() => useUpdate(fakeMessage()));
    await waitFor(() => expect(result.current.available).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.available).toBeNull();
  });
});
