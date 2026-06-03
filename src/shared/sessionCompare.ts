import { compareResponses } from './diff';
import type { SessionComparisonRow, TrafficRecord } from './types';

const pathWithoutQuery = (path: string): string => path.split('?')[0];

const matchByMethodPath = (records: TrafficRecord[]): Map<string, TrafficRecord> => {
  const map = new Map<string, TrafficRecord>();
  for (const record of records) {
    const key = `${record.method} ${pathWithoutQuery(record.path)}`;
    if (!map.has(key)) map.set(key, record);
  }
  return map;
};

/** 두 세션을 METHOD+경로로 매칭해 same/changed/onlyA/onlyB 분류. */
export const buildSessionComparison = (
  rowsA: TrafficRecord[],
  rowsB: TrafficRecord[],
): SessionComparisonRow[] => {
  const mapA = matchByMethodPath(rowsA);
  const mapB = matchByMethodPath(rowsB);
  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();

  return keys.map((key) => {
    const a = mapA.get(key);
    const b = mapB.get(key);
    if (a && b) {
      const comparison = compareResponses(
        { statusCode: a.statusCode, body: a.responseBody ?? '' },
        { statusCode: b.statusCode, body: b.responseBody ?? '' },
      );
      const changed = comparison.statusChanged || comparison.bodyDiff.some((line) => line.type !== 'same');
      return { key, status: changed ? 'changed' : 'same', comparison };
    }
    return { key, status: a ? 'onlyA' : 'onlyB', comparison: null };
  });
};
