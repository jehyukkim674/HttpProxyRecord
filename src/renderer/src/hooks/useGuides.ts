import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { Guide, GuideStep, GuideSummary } from '../../../shared/types';

/** 가이드 목록 + 저장/삭제/로드. */
export const useGuides = () => {
  const [guides, setGuides] = useState<GuideSummary[]>([]);

  const reload = useCallback(async () => {
    setGuides(await ipc.listGuides());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (input: { id?: number; title: string; steps: GuideStep[] }): Promise<Guide> => {
      const saved = await ipc.saveGuide(input);
      await reload();
      return saved;
    },
    [reload],
  );

  const remove = useCallback(async (id: number) => {
    setGuides(await ipc.deleteGuide(id));
  }, []);

  const load = useCallback((id: number): Promise<Guide | null> => ipc.getGuide(id), []);

  return { guides, reload, save, remove, load };
};
