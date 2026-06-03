import { describe, expect, it } from 'vitest';
import { computeWaterfallRows } from '../src/shared/waterfall';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://x/a',
  host: 'x',
  path: '/a',
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

describe('computeWaterfallRows', () => {
  it('빈 배열은 빈 결과', () => {
    expect(computeWaterfallRows([])).toEqual([]);
  });
  it('최소 시작시각 기준 오프셋을 계산한다', () => {
    const rows = computeWaterfallRows([
      rec({ id: 1, timestamp: '2026-06-03T10:00:00.000Z', durationMs: 50 }),
      rec({ id: 2, timestamp: '2026-06-03T10:00:00.200Z', durationMs: 30 }),
    ]);
    expect(rows[0].leftMs).toBe(0);
    expect(rows[0].widthMs).toBe(50);
    expect(rows[1].leftMs).toBe(200);
    expect(rows[1].widthMs).toBe(30);
  });
  it('durationMs 0은 최소 1', () => {
    expect(computeWaterfallRows([rec({ durationMs: 0 })])[0].widthMs).toBe(1);
  });
  it('label은 METHOD path', () => {
    expect(computeWaterfallRows([rec({ method: 'POST', path: '/x' })])[0].label).toBe('POST /x');
  });
});
