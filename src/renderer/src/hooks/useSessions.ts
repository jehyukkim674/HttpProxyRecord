import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { Session } from '../../../shared/types';

type UseSessionsResult = {
  sessions: Session[];
  reload: () => Promise<void>;
  remove: (sessionId: number) => Promise<void>;
};

export const useSessions = (): UseSessionsResult => {
  const [sessions, setSessions] = useState<Session[]>([]);

  const reload = useCallback(async () => {
    setSessions(await ipc.listSessions());
  }, []);

  const remove = useCallback(async (sessionId: number) => {
    setSessions(await ipc.deleteSession(sessionId));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sessions, reload, remove };
};
