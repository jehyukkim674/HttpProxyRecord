import { useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { TrafficRecord } from '../../../shared/types';

type UseTrafficResult = {
  records: TrafficRecord[];
};

/**
 * 선택된 세션의 트래픽 목록.
 * - 세션 선택 시 저장된 기록을 로드
 * - 그 세션이 녹화 중이면 실시간 트래픽을 이어서 append
 */
export const useTraffic = (selectedSessionId: number | null): UseTrafficResult => {
  const [records, setRecords] = useState<TrafficRecord[]>([]);

  useEffect(() => {
    if (selectedSessionId === null) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    void ipc.getSessionTraffic(selectedSessionId).then((loaded) => {
      if (!cancelled) setRecords(loaded);
    });

    const unsubscribe = ipc.onTraffic((record) => {
      if (record.sessionId === selectedSessionId) {
        setRecords((previous) => [...previous, record]);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedSessionId]);

  return { records };
};
