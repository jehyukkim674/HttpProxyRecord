import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { ProxyStatus } from '../../../shared/types';

const DEFAULT_PROXY_PORT = 8888;

type UseProxyControlResult = {
  status: ProxyStatus;
  startRecording: (sessionName: string) => Promise<ProxyStatus | null>;
  stopRecording: () => Promise<void>;
  error: string | null;
};

export const useProxyControl = (onRecordingChanged: () => void): UseProxyControlResult => {
  const [status, setStatus] = useState<ProxyStatus>({
    running: false,
    port: null,
    recordingSessionId: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ipc.getProxyStatus().then(setStatus);
  }, []);

  const startRecording = useCallback(
    async (sessionName: string): Promise<ProxyStatus | null> => {
      setError(null);
      try {
        const nextStatus = await ipc.startRecording(sessionName, DEFAULT_PROXY_PORT);
        setStatus(nextStatus);
        onRecordingChanged();
        return nextStatus;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '녹화 시작에 실패했어요');
        return null;
      }
    },
    [onRecordingChanged],
  );

  const stopRecording = useCallback(async () => {
    setError(null);
    try {
      const nextStatus = await ipc.stopRecording();
      setStatus(nextStatus);
      onRecordingChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '녹화 중지에 실패했어요');
    }
  }, [onRecordingChanged]);

  return { status, startRecording, stopRecording, error };
};
