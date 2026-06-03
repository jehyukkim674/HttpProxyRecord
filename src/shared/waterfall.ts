import type { TrafficRecord, WaterfallRow } from './types';

/** 레코드를 시간축 막대(시작 오프셋/너비)로 변환. 순수 시각화 계산. */
export const computeWaterfallRows = (records: TrafficRecord[]): WaterfallRow[] => {
  if (records.length === 0) return [];
  const starts = records.map((record) => new Date(record.timestamp).getTime());
  const minStart = Math.min(...starts);

  return records.map((record) => ({
    id: record.id,
    label: `${record.method} ${record.path}`,
    statusCode: record.statusCode,
    leftMs: new Date(record.timestamp).getTime() - minStart,
    widthMs: Math.max(record.durationMs, 1),
  }));
};
