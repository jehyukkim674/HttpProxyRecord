// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuides } from './useGuides';

const ipcMock = vi.hoisted(() => ({
  listGuides: vi.fn(),
  saveGuide: vi.fn(),
  deleteGuide: vi.fn(),
  getGuide: vi.fn(),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

const summary = (id: number) => ({ id, title: `g${id}`, createdAt: '', stepCount: 0 });

describe('useGuides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.listGuides.mockResolvedValue([summary(1)]);
  });

  it('마운트 시 가이드 목록을 로드한다', async () => {
    const { result } = renderHook(() => useGuides());
    await waitFor(() => expect(result.current.guides).toHaveLength(1));
  });

  it('save는 저장 후 목록을 다시 로드하고 저장본을 반환한다', async () => {
    const saved = { id: 2, title: 'new', steps: [], createdAt: '' };
    ipcMock.saveGuide.mockResolvedValue(saved);
    const { result } = renderHook(() => useGuides());
    await waitFor(() => expect(result.current.guides).toHaveLength(1));

    ipcMock.listGuides.mockResolvedValue([summary(1), summary(2)]);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.save({ title: 'new', steps: [] });
    });

    expect(returned).toEqual(saved);
    expect(result.current.guides).toHaveLength(2);
  });

  it('remove는 삭제 후 반환 목록으로 갱신한다', async () => {
    ipcMock.deleteGuide.mockResolvedValue([]);
    const { result } = renderHook(() => useGuides());
    await waitFor(() => expect(result.current.guides).toHaveLength(1));
    await act(async () => {
      await result.current.remove(1);
    });
    expect(ipcMock.deleteGuide).toHaveBeenCalledWith(1);
    expect(result.current.guides).toEqual([]);
  });

  it('load는 단일 가이드를 가져온다', async () => {
    const guide = { id: 1, title: 'g1', steps: [], createdAt: '' };
    ipcMock.getGuide.mockResolvedValue(guide);
    const { result } = renderHook(() => useGuides());
    await waitFor(() => expect(result.current.guides).toHaveLength(1));
    await expect(result.current.load(1)).resolves.toEqual(guide);
  });
});
