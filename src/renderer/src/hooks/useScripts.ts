import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { InterceptScript } from '../../../shared/types';

export type ScriptLogEntry = { scriptId: string; level: string; message: string };

/** 스크립트 목록 CRUD + 실행 로그 구독. 목록/로그 상태를 소유한다. */
export const useScripts = () => {
  const [scripts, setScripts] = useState<InterceptScript[]>([]);
  const [logs, setLogs] = useState<ScriptLogEntry[]>([]);

  const reload = useCallback(async () => {
    setScripts(await ipc.listScripts());
  }, []);

  useEffect(() => {
    void reload();
    const off = ipc.onScriptLog((entry) => setLogs((prev) => [...prev.slice(-199), entry]));
    return off;
  }, [reload]);

  const save = useCallback(async (input: { id?: string; name: string; code: string; enabled: boolean }) => {
    setScripts(await ipc.saveScript(input));
  }, []);

  const remove = useCallback(async (id: string) => {
    setScripts(await ipc.deleteScript(id));
  }, []);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    setScripts(await ipc.toggleScript(id, enabled));
  }, []);

  return { scripts, logs, save, remove, toggle };
};
