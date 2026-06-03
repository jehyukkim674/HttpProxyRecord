import type { StatsSummary, TrafficRecord } from './types';

const SLOWEST_LIMIT = 5;

/** 트래픽 목록에서 통계 요약을 계산한다 (순수함수). */
export const computeStats = (records: TrafficRecord[]): StatsSummary => {
  if (records.length === 0) {
    return { totalCount: 0, avgDurationMs: 0, errorRate: 0, byDomain: [], slowest: [] };
  }

  const totalDuration = records.reduce((sum, record) => sum + record.durationMs, 0);
  const errorCount = records.filter((record) => record.statusCode >= 400).length;

  const domainCounts = new Map<string, number>();
  for (const record of records) {
    domainCounts.set(record.host, (domainCounts.get(record.host) ?? 0) + 1);
  }

  return {
    totalCount: records.length,
    avgDurationMs: Math.round(totalDuration / records.length),
    errorRate: errorCount / records.length,
    byDomain: [...domainCounts.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count),
    slowest: [...records].sort((a, b) => b.durationMs - a.durationMs).slice(0, SLOWEST_LIMIT),
  };
};
