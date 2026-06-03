import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/shared/stats';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://a.com/x',
  host: 'a.com',
  path: '/x',
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  responseHeaders: {},
  responseBody: null,
  durationMs: 100,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '',
  ...over,
});

describe('computeStats', () => {
  it('빈 배열은 0 통계', () => {
    const stats = computeStats([]);
    expect(stats.totalCount).toBe(0);
    expect(stats.avgDurationMs).toBe(0);
    expect(stats.errorRate).toBe(0);
    expect(stats.byDomain).toEqual([]);
    expect(stats.slowest).toEqual([]);
  });

  it('총건수/평균 응답시간을 계산한다', () => {
    const stats = computeStats([rec({ durationMs: 100 }), rec({ durationMs: 300 })]);
    expect(stats.totalCount).toBe(2);
    expect(stats.avgDurationMs).toBe(200);
  });

  it('에러율(4xx+5xx)을 계산한다', () => {
    const stats = computeStats([
      rec({ statusCode: 200 }),
      rec({ statusCode: 404 }),
      rec({ statusCode: 500 }),
      rec({ statusCode: 301 }),
    ]);
    expect(stats.errorRate).toBe(0.5);
  });

  it('도메인별 건수를 내림차순으로 집계한다', () => {
    const stats = computeStats([rec({ host: 'a.com' }), rec({ host: 'b.com' }), rec({ host: 'a.com' })]);
    expect(stats.byDomain[0]).toEqual({ host: 'a.com', count: 2 });
    expect(stats.byDomain[1]).toEqual({ host: 'b.com', count: 1 });
  });

  it('느린 요청 Top N을 내림차순으로 반환한다', () => {
    const stats = computeStats([
      rec({ id: 1, durationMs: 50 }),
      rec({ id: 2, durationMs: 500 }),
      rec({ id: 3, durationMs: 200 }),
    ]);
    expect(stats.slowest.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
