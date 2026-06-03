import { useCallback, useState } from 'react';
import { message } from 'antd';
import { ipc } from '../services/ipc';
import type { TrafficRecord } from '../../../shared/types';

type MessageApi = ReturnType<typeof message.useMessage>[0];
type AiModalState = { open: boolean; title: string; loading: boolean; text: string };

/**
 * AI 액션(#21~#24) — 응답 설명/테스트 생성/이상 탐지/자연어 검색.
 * 결과 모달 상태와 검색 모달 열림 상태를 소유한다.
 */
export const useAiActions = (
  messageApi: MessageApi,
  selectedSessionId: number | null,
  records: TrafficRecord[],
) => {
  const [modal, setModal] = useState<AiModalState>({ open: false, title: '', loading: false, text: '' });
  const [searchOpen, setSearchOpen] = useState(false);

  const run = useCallback(async (title: string, task: () => Promise<string>) => {
    setModal({ open: true, title, loading: true, text: '' });
    try {
      const text = await task();
      setModal({ open: true, title, loading: false, text });
    } catch (caught) {
      setModal({
        open: true,
        title,
        loading: false,
        text: caught instanceof Error ? caught.message : 'AI 호출 실패',
      });
    }
  }, []);

  const explain = useCallback(
    (record: TrafficRecord) => void run('AI 응답 설명', () => ipc.aiExplain(record.id)),
    [run],
  );

  const tests = useCallback(
    (record: TrafficRecord) => void run('AI 테스트 케이스', () => ipc.aiGenerateTests(record.id)),
    [run],
  );

  const anomalies = useCallback(() => {
    if (selectedSessionId === null) {
      void messageApi.info('세션을 먼저 선택하세요');
      return;
    }
    void run('AI 이상 탐지', () => ipc.aiDetectAnomalies(selectedSessionId));
  }, [selectedSessionId, run, messageApi]);

  const report = useCallback(() => {
    if (selectedSessionId === null) {
      void messageApi.info('세션을 먼저 선택하세요');
      return;
    }
    void run('AI 세션 리포트', () => ipc.aiSessionReport(selectedSessionId));
  }, [selectedSessionId, run, messageApi]);

  const security = useCallback(
    (record: TrafficRecord) => void run('AI 보안 제안', () => ipc.aiSecuritySuggest(record.id)),
    [run],
  );

  const search = useCallback(
    (query: string) => {
      setSearchOpen(false);
      if (selectedSessionId === null) {
        void messageApi.info('세션을 먼저 선택하세요');
        return;
      }
      void run(`AI 검색: ${query}`, async () => {
        const ids = await ipc.aiSearch(selectedSessionId, query);
        if (ids.length === 0) return '매칭되는 트래픽이 없어요.';
        const idSet = new Set(ids);
        return records
          .filter((record) => idSet.has(record.id))
          .map((record) => `#${record.id} ${record.method} ${record.path} → ${record.statusCode}`)
          .join('\n');
      });
    },
    [selectedSessionId, records, run, messageApi],
  );

  const closeModal = useCallback(() => setModal((previous) => ({ ...previous, open: false })), []);

  return {
    modal,
    closeModal,
    searchOpen,
    setSearchOpen,
    explain,
    tests,
    anomalies,
    search,
    report,
    security,
  };
};
