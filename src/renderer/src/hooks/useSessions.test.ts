// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessions } from './useSessions';

const ipcMock = vi.hoisted(() => ({ listSessions: vi.fn(), deleteSession: vi.fn() }));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

const session = (id: number) => ({ id, name: `s${id}`, createdAt: '', endedAt: null, recordCount: 0 });

describe('useSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('마운트 시 세션 목록을 로드한다', async () => {
    ipcMock.listSessions.mockResolvedValue([session(1), session(2)]);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
  });

  it('reload는 목록을 다시 가져온다', async () => {
    ipcMock.listSessions.mockResolvedValue([session(1)]);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    ipcMock.listSessions.mockResolvedValue([session(1), session(2), session(3)]);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.sessions).toHaveLength(3);
  });

  it('remove는 삭제 후 반환된 목록으로 갱신한다', async () => {
    ipcMock.listSessions.mockResolvedValue([session(1), session(2)]);
    ipcMock.deleteSession.mockResolvedValue([session(2)]);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    await act(async () => {
      await result.current.remove(1);
    });
    expect(ipcMock.deleteSession).toHaveBeenCalledWith(1);
    expect(result.current.sessions.map((s) => s.id)).toEqual([2]);
  });
});
