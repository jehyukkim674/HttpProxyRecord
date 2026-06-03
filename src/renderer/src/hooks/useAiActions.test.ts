// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiActions } from './useAiActions';
import type { TrafficRecord } from '../../../shared/types';

const ipcMock = vi.hoisted(() => ({
  aiExplain: vi.fn(),
  aiGenerateTests: vi.fn(),
  aiDetectAnomalies: vi.fn(),
  aiSearch: vi.fn(),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

type MessageApi = Parameters<typeof useAiActions>[0];
const fakeMessage = () =>
  ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }) as unknown as MessageApi;

const rec = (p: Partial<TrafficRecord>): TrafficRecord => p as TrafficRecord;

describe('useAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explain: 결과 모달에 ipc 응답 텍스트를 채운다', async () => {
    ipcMock.aiExplain.mockResolvedValue('이 응답은 200 OK 입니다');
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, 1, []));

    act(() => {
      result.current.explain(rec({ id: 5 }));
    });

    await waitFor(() => expect(result.current.modal.text).toBe('이 응답은 200 OK 입니다'));
    expect(ipcMock.aiExplain).toHaveBeenCalledWith(5);
    expect(result.current.modal.open).toBe(true);
    expect(result.current.modal.loading).toBe(false);
  });

  it('anomalies: 세션 미선택이면 안내만 하고 ipc를 호출하지 않는다', () => {
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, null, []));

    act(() => {
      result.current.anomalies();
    });

    expect(message.info).toHaveBeenCalledWith('세션을 먼저 선택하세요');
    expect(ipcMock.aiDetectAnomalies).not.toHaveBeenCalled();
  });

  it('anomalies: 세션이 있으면 ipc 결과를 모달에 채운다', async () => {
    ipcMock.aiDetectAnomalies.mockResolvedValue('이상 없음');
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, 2, []));

    act(() => {
      result.current.anomalies();
    });

    await waitFor(() => expect(result.current.modal.text).toBe('이상 없음'));
    expect(ipcMock.aiDetectAnomalies).toHaveBeenCalledWith(2);
  });

  it('search: 매칭 id를 레코드 요약 텍스트로 변환한다', async () => {
    ipcMock.aiSearch.mockResolvedValue([1]);
    const records = [
      rec({ id: 1, method: 'GET', path: '/a', statusCode: 200 }),
      rec({ id: 2, method: 'POST', path: '/b', statusCode: 500 }),
    ];
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, 1, records));

    act(() => {
      result.current.search('느린 요청');
    });

    await waitFor(() => expect(result.current.modal.text).toContain('#1 GET /a → 200'));
    expect(result.current.modal.text).not.toContain('#2');
    expect(result.current.searchOpen).toBe(false);
  });

  it('search: 매칭이 없으면 안내 문구', async () => {
    ipcMock.aiSearch.mockResolvedValue([]);
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, 1, []));

    act(() => {
      result.current.search('없는 것');
    });

    await waitFor(() => expect(result.current.modal.text).toBe('매칭되는 트래픽이 없어요.'));
  });

  it('closeModal: 모달 open=false', async () => {
    ipcMock.aiExplain.mockResolvedValue('x');
    const message = fakeMessage();
    const { result } = renderHook(() => useAiActions(message, 1, []));

    act(() => {
      result.current.explain(rec({ id: 1 }));
    });
    await waitFor(() => expect(result.current.modal.open).toBe(true));

    act(() => {
      result.current.closeModal();
    });
    expect(result.current.modal.open).toBe(false);
  });
});
