import { useMemo, useState } from 'react';
import { emptyFilter, filterTraffic } from '../../../shared/filterTraffic';
import type { TrafficFilter, TrafficRecord } from '../../../shared/types';

export const useTrafficFilter = (records: TrafficRecord[]) => {
  const [filter, setFilter] = useState<TrafficFilter>(emptyFilter);
  const filtered = useMemo(() => filterTraffic(records, filter), [records, filter]);
  return { filter, setFilter, filtered };
};
