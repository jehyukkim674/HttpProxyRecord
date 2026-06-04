// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScripts } from './useScripts';

const ipcMock = vi.hoisted(() => ({
  listScripts: vi.fn(),
  saveScript: vi.fn(),
  deleteScript: vi.fn(),
  toggleScript: vi.fn(),
  onScriptLog: vi.fn(
    (_cb: (e: { scriptId: string; level: string; message: string }) => void) => () => undefined,
  ),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

describe('useScripts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.listScripts.mockResolvedValue([]);
  });

  it('마운트 시 목록을 로드하고 로그를 구독한다', async () => {
    ipcMock.listScripts.mockResolvedValue([{ id: '1', name: 'a', code: '', enabled: true }]);
    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(result.current.scripts).toHaveLength(1));
    expect(ipcMock.onScriptLog).toHaveBeenCalled();
  });

  it('save 후 목록을 갱신한다', async () => {
    ipcMock.saveScript.mockResolvedValue([{ id: '1', name: 'b', code: 'x', enabled: true }]);
    const { result } = renderHook(() => useScripts());
    await act(async () => {
      await result.current.save({ name: 'b', code: 'x', enabled: true });
    });
    expect(ipcMock.saveScript).toHaveBeenCalledWith({ name: 'b', code: 'x', enabled: true });
    expect(result.current.scripts[0].name).toBe('b');
  });

  it('toggle 후 목록을 갱신한다', async () => {
    ipcMock.toggleScript.mockResolvedValue([{ id: '1', name: 'b', code: 'x', enabled: false }]);
    const { result } = renderHook(() => useScripts());
    await act(async () => {
      await result.current.toggle('1', false);
    });
    expect(ipcMock.toggleScript).toHaveBeenCalledWith('1', false);
    expect(result.current.scripts[0].enabled).toBe(false);
  });

  it('remove 후 반환된 목록으로 갱신한다', async () => {
    ipcMock.deleteScript.mockResolvedValue([]);
    const { result } = renderHook(() => useScripts());
    await act(async () => {
      await result.current.remove('1');
    });
    expect(ipcMock.deleteScript).toHaveBeenCalledWith('1');
    expect(result.current.scripts).toEqual([]);
  });

  it('스크립트 로그를 구독해 누적한다', async () => {
    let emit: (e: { scriptId: string; level: string; message: string }) => void = () => undefined;
    ipcMock.onScriptLog.mockImplementation(
      (cb: (e: { scriptId: string; level: string; message: string }) => void) => {
        emit = cb;
        return () => undefined;
      },
    );
    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(ipcMock.onScriptLog).toHaveBeenCalled());

    act(() => emit({ scriptId: 's1', level: 'info', message: '로그1' }));
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].message).toBe('로그1');
  });
});
