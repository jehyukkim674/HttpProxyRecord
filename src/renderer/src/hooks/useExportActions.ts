import { useCallback } from 'react';
import { message } from 'antd';
import { ipc } from '../services/ipc';

type MessageApi = ReturnType<typeof message.useMessage>[0];

/** 세션/요청 내보내기·가져오기·클립보드 복사. 모두 부수효과(파일 저장/메시지)만 갖는 무상태 액션. */
export const useExportActions = (messageApi: MessageApi, reload: () => Promise<void>) => {
  const exportHar = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportHar(sessionId);
      if (result.saved) void messageApi.success(`HAR 저장 완료: ${result.path}`);
    },
    [messageApi],
  );

  const exportMarkdown = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportMarkdown(sessionId);
      if (result.saved) void messageApi.success(`Markdown 저장 완료: ${result.path}`);
    },
    [messageApi],
  );

  const exportPostman = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportPostman(sessionId);
      if (result.saved) void messageApi.success(`Postman 컬렉션 저장: ${result.path}`);
    },
    [messageApi],
  );

  const exportOpenApi = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportOpenApi(sessionId);
      if (result.saved) void messageApi.success(`OpenAPI 스펙 저장: ${result.path}`);
    },
    [messageApi],
  );

  const exportK6 = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportK6(sessionId);
      if (result.saved) void messageApi.success(`k6 스크립트 저장: ${result.path}`);
    },
    [messageApi],
  );

  const importHar = useCallback(async () => {
    const result = await ipc.importHar();
    if (result.imported) {
      await reload();
      void messageApi.success('HAR을 새 세션으로 가져왔어요');
    }
  }, [messageApi, reload]);

  const exportBundle = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportBundle(sessionId);
      if (result.saved) void messageApi.success(`세션 번들 저장: ${result.path}`);
    },
    [messageApi],
  );

  const importBundle = useCallback(async () => {
    const result = await ipc.importBundle();
    if (result.imported) {
      await reload();
      void messageApi.success('세션 번들을 가져왔어요');
    }
  }, [messageApi, reload]);

  const copyCurl = useCallback(
    async (recordId: number) => {
      await ipc.copyCurl(recordId);
      void messageApi.success('curl 명령어를 클립보드에 복사했어요');
    },
    [messageApi],
  );

  const copySnippet = useCallback(
    async (text: string, label: string) => {
      await ipc.copyToClipboard(text);
      void messageApi.success(`${label} 코드를 복사했어요`);
    },
    [messageApi],
  );

  return {
    exportHar,
    exportMarkdown,
    exportPostman,
    exportOpenApi,
    exportK6,
    importHar,
    exportBundle,
    importBundle,
    copyCurl,
    copySnippet,
  };
};
