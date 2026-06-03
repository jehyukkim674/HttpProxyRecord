import { useCallback, useState } from 'react';

/** Composer 변수 저장소 — 모달을 닫았다 열어도 유지(수동 순차 체이닝). */
export const useComposerVariables = () => {
  const [variables, setVariables] = useState<Record<string, string>>({});

  const setVariable = useCallback((name: string, value: string) => {
    setVariables((previous) => ({ ...previous, [name]: value }));
  }, []);

  const removeVariable = useCallback((name: string) => {
    setVariables((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  return { variables, setVariable, removeVariable };
};
