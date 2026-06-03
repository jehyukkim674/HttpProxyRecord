import { describe, expect, it } from 'vitest';
import { buildSessionComparison } from '../src/shared/sessionCompare';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  responseHeaders: {},
  responseBody: 'ok',
  durationMs: 10,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...over,
});

describe('buildSessionComparison', () => {
  it('동일 응답은 same', () => {
    const rows = buildSessionComparison([rec({ responseBody: 'x' })], [rec({ responseBody: 'x' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('same');
  });
  it('본문이 다르면 changed', () => {
    const rows = buildSessionComparison([rec({ responseBody: 'x' })], [rec({ responseBody: 'y' })]);
    expect(rows[0].status).toBe('changed');
    expect(rows[0].comparison).not.toBeNull();
  });
  it('상태코드가 다르면 changed', () => {
    const rows = buildSessionComparison([rec({ statusCode: 200 })], [rec({ statusCode: 500 })]);
    expect(rows[0].status).toBe('changed');
  });
  it('A에만 있으면 onlyA, B에만 있으면 onlyB', () => {
    const rows = buildSessionComparison([rec({ path: '/a' })], [rec({ path: '/b' })]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.status]));
    expect(byKey['GET /a']).toBe('onlyA');
    expect(byKey['GET /b']).toBe('onlyB');
  });
  it('쿼리스트링이 달라도 경로가 같으면 매칭', () => {
    const rows = buildSessionComparison([rec({ path: '/u?p=1' })], [rec({ path: '/u?p=2' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('same');
  });
});
