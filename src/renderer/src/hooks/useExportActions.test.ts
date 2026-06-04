// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportActions } from './useExportActions';

const ipcMock = vi.hoisted(() => ({
  exportHar: vi.fn(),
  exportMarkdown: vi.fn(),
  exportPostman: vi.fn(),
  exportOpenApi: vi.fn(),
  exportK6: vi.fn(),
  exportBundle: vi.fn(),
  importHar: vi.fn(),
  importBundle: vi.fn(),
  copyCurl: vi.fn(),
  copyToClipboard: vi.fn(),
}));
vi.mock('../services/ipc', () => ({ ipc: ipcMock }));

type MessageApi = Parameters<typeof useExportActions>[0];
const fakeMessage = () =>
  ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }) as unknown as MessageApi;

describe('useExportActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportHar 저장됨: 경로와 함께 success', async () => {
    ipcMock.exportHar.mockResolvedValue({ saved: true, path: '/tmp/s.har' });
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, vi.fn()));

    await act(async () => {
      await result.current.exportHar(1);
    });

    expect(ipcMock.exportHar).toHaveBeenCalledWith(1);
    expect(message.success).toHaveBeenCalledWith('HAR 저장 완료: /tmp/s.har');
  });

  it('exportHar 취소(saved=false): 메시지 없음', async () => {
    ipcMock.exportHar.mockResolvedValue({ saved: false });
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, vi.fn()));

    await act(async () => {
      await result.current.exportHar(1);
    });

    expect(message.success).not.toHaveBeenCalled();
  });

  it('importHar 성공: reload 호출 후 success', async () => {
    ipcMock.importHar.mockResolvedValue({ imported: true, sessions: [] });
    const reload = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, reload));

    await act(async () => {
      await result.current.importHar();
    });

    expect(reload).toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith('HAR을 새 세션으로 가져왔어요');
  });

  it('importHar 취소: reload 미호출', async () => {
    ipcMock.importHar.mockResolvedValue({ imported: false });
    const reload = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, reload));

    await act(async () => {
      await result.current.importHar();
    });

    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    ['exportMarkdown', 'Markdown 저장 완료: /tmp/o'],
    ['exportPostman', 'Postman 컬렉션 저장: /tmp/o'],
    ['exportOpenApi', 'OpenAPI 스펙 저장: /tmp/o'],
    ['exportK6', 'k6 스크립트 저장: /tmp/o'],
    ['exportBundle', '세션 번들 저장: /tmp/o'],
  ] as const)('%s 저장됨: 해당 success 메시지', async (name, expected) => {
    ipcMock[name].mockResolvedValue({ saved: true, path: '/tmp/o' });
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, vi.fn()));

    await act(async () => {
      await (result.current as unknown as Record<string, (id: number) => Promise<void>>)[name](1);
    });

    expect(ipcMock[name]).toHaveBeenCalledWith(1);
    expect(message.success).toHaveBeenCalledWith(expected);
  });

  it('importBundle 성공: reload 후 success', async () => {
    ipcMock.importBundle.mockResolvedValue({ imported: true });
    const reload = vi.fn().mockResolvedValue(undefined);
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, reload));

    await act(async () => {
      await result.current.importBundle();
    });

    expect(reload).toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith('세션 번들을 가져왔어요');
  });

  it('copyCurl / copySnippet: ipc 호출 + 복사 안내', async () => {
    ipcMock.copyCurl.mockResolvedValue({ copied: true });
    ipcMock.copyToClipboard.mockResolvedValue({ copied: true });
    const message = fakeMessage();
    const { result } = renderHook(() => useExportActions(message, vi.fn()));

    await act(async () => {
      await result.current.copyCurl(7);
    });
    expect(ipcMock.copyCurl).toHaveBeenCalledWith(7);

    await act(async () => {
      await result.current.copySnippet('print(1)', 'Python');
    });
    expect(ipcMock.copyToClipboard).toHaveBeenCalledWith('print(1)');
    expect(message.success).toHaveBeenCalledWith('Python 코드를 복사했어요');
  });
});
