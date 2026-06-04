// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProxyControl } from './useProxyControl';

const ipcMock = vi.hoisted(() => ({
  getProxyStatus: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

const idle = { running: false, port: null, recordingSessionId: null };
const running = { running: true, port: 8888, recordingSessionId: 7 };

describe('useProxyControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.getProxyStatus.mockResolvedValue(idle);
  });

  it('마운트 시 프록시 상태를 가져온다', async () => {
    const { result } = renderHook(() => useProxyControl(() => undefined));
    await waitFor(() => expect(result.current.status.running).toBe(false));
  });

  it('startRecording 성공: 상태 갱신 + 콜백 호출 + 기본 포트 8888', async () => {
    ipcMock.startRecording.mockResolvedValue(running);
    const onChanged = vi.fn();
    const { result } = renderHook(() => useProxyControl(onChanged));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.startRecording('내 세션');
    });

    expect(ipcMock.startRecording).toHaveBeenCalledWith('내 세션', 8888);
    expect(result.current.status).toEqual(running);
    expect(onChanged).toHaveBeenCalled();
    expect(returned).toEqual(running);
    expect(result.current.error).toBeNull();
  });

  it('startRecording 실패: error 메시지를 담고 null 반환', async () => {
    ipcMock.startRecording.mockRejectedValue(new Error('포트 충돌'));
    const { result } = renderHook(() => useProxyControl(() => undefined));

    let returned: unknown = 'x';
    await act(async () => {
      returned = await result.current.startRecording('s');
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('포트 충돌');
  });

  it('stopRecording 성공: 상태 갱신 + 콜백', async () => {
    ipcMock.stopRecording.mockResolvedValue(idle);
    const onChanged = vi.fn();
    const { result } = renderHook(() => useProxyControl(onChanged));

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.status.running).toBe(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it('stopRecording 실패: error 메시지', async () => {
    ipcMock.stopRecording.mockRejectedValue(new Error('중지 실패'));
    const { result } = renderHook(() => useProxyControl(() => undefined));
    await act(async () => {
      await result.current.stopRecording();
    });
    expect(result.current.error).toBe('중지 실패');
  });
});
