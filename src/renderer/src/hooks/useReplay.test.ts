// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReplay } from './useReplay';

const ipcMock = vi.hoisted(() => ({ startReplay: vi.fn(), stopReplay: vi.fn() }));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

type MessageApi = Parameters<typeof useReplay>[0];
const fakeMessage = () =>
  ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }) as unknown as MessageApi;

describe('useReplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start 성공: 상태를 갱신하고 success 메시지를 띄운다', async () => {
    const status = { running: true, port: 8889, sessionId: 1, hitCount: 0, missCount: 0 };
    ipcMock.startReplay.mockResolvedValue(status);
    const message = fakeMessage();
    const { result } = renderHook(() => useReplay(message));

    await act(async () => {
      await result.current.start(1);
    });

    expect(ipcMock.startReplay).toHaveBeenCalledWith(1, 8889);
    expect(result.current.status).toEqual(status);
    expect(message.success).toHaveBeenCalled();
  });

  it('start 실패: error 메시지를 띄우고 상태는 null로 둔다', async () => {
    ipcMock.startReplay.mockRejectedValue(new Error('포트 충돌'));
    const message = fakeMessage();
    const { result } = renderHook(() => useReplay(message));

    await act(async () => {
      await result.current.start(1);
    });

    expect(message.error).toHaveBeenCalledWith('포트 충돌');
    expect(result.current.status).toBeNull();
  });

  it('stop: 상태를 null로 되돌리고 히트/미스를 알린다', async () => {
    ipcMock.startReplay.mockResolvedValue({
      running: true,
      port: 8889,
      sessionId: 1,
      hitCount: 3,
      missCount: 1,
    });
    ipcMock.stopReplay.mockResolvedValue({
      running: false,
      port: null,
      sessionId: null,
      hitCount: 3,
      missCount: 1,
    });
    const message = fakeMessage();
    const { result } = renderHook(() => useReplay(message));

    await act(async () => {
      await result.current.start(1);
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.status).toBeNull();
    expect(message.info).toHaveBeenCalled();
  });
});
