import { useCallback, useState } from 'react';
import { message } from 'antd';
import { ipc } from '../services/ipc';
import type { ReplayStatus } from '../../../shared/types';

const DEFAULT_REPLAY_PORT = 8889;

type MessageApi = ReturnType<typeof message.useMessage>[0];

/** Mock 서버 재생 시작/중지. 재생 상태(status)를 소유한다. */
export const useReplay = (messageApi: MessageApi) => {
  const [status, setStatus] = useState<ReplayStatus | null>(null);

  const start = useCallback(
    async (sessionId: number) => {
      try {
        const next = await ipc.startReplay(sessionId, DEFAULT_REPLAY_PORT);
        setStatus(next);
        void messageApi.success(`Mock 서버 재생 시작 — 127.0.0.1:${next.port}`);
      } catch (caught) {
        void messageApi.error(caught instanceof Error ? caught.message : '재생 시작 실패');
      }
    },
    [messageApi],
  );

  const stop = useCallback(async () => {
    const final = await ipc.stopReplay();
    setStatus(null);
    void messageApi.info(`재생 중지 (히트 ${final.hitCount} / 미스 ${final.missCount})`);
  }, [messageApi]);

  return { status, start, stop };
};
