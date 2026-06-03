// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScripts } from './useScripts';

const ipcMock = vi.hoisted(() => ({
  listScripts: vi.fn(),
  saveScript: vi.fn(),
  deleteScript: vi.fn(),
  toggleScript: vi.fn(),
  onScriptLog: vi.fn(() => () => {}),
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
});
