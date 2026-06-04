// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTraffic } from './useTraffic';
import type { TrafficRecord } from '../../../shared/types';

const ipcMock = vi.hoisted(() => ({ getSessionTraffic: vi.fn(), onTraffic: vi.fn() }));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

const rec = (id: number, sessionId: number): TrafficRecord =>
  ({ id, sessionId, method: 'GET', url: '', host: '', path: '' }) as unknown as TrafficRecord;

describe('useTraffic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.onTraffic.mockReturnValue(() => undefined);
  });

  it('sessionId가 null이면 빈 목록', () => {
    const { result } = renderHook(() => useTraffic(null));
    expect(result.current.records).toEqual([]);
    expect(ipcMock.getSessionTraffic).not.toHaveBeenCalled();
  });

  it('세션 선택 시 저장된 트래픽을 로드한다', async () => {
    ipcMock.getSessionTraffic.mockResolvedValue([rec(1, 5), rec(2, 5)]);
    const { result } = renderHook(() => useTraffic(5));
    await waitFor(() => expect(result.current.records).toHaveLength(2));
    expect(ipcMock.getSessionTraffic).toHaveBeenCalledWith(5);
  });

  it('실시간 트래픽 중 해당 세션 것만 append한다', async () => {
    ipcMock.getSessionTraffic.mockResolvedValue([]);
    let push: (r: TrafficRecord) => void = () => undefined;
    ipcMock.onTraffic.mockImplementation((cb: (r: TrafficRecord) => void) => {
      push = cb;
      return () => undefined;
    });
    const { result } = renderHook(() => useTraffic(5));
    await waitFor(() => expect(ipcMock.onTraffic).toHaveBeenCalled());

    act(() => push(rec(10, 5)));
    act(() => push(rec(11, 9))); // 다른 세션 → 무시
    expect(result.current.records.map((r) => r.id)).toEqual([10]);
  });

  it('언마운트 시 구독을 해제한다', async () => {
    ipcMock.getSessionTraffic.mockResolvedValue([]);
    const unsub = vi.fn();
    ipcMock.onTraffic.mockReturnValue(unsub);
    const { unmount } = renderHook(() => useTraffic(5));
    await waitFor(() => expect(ipcMock.onTraffic).toHaveBeenCalled());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
