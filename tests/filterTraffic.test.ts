import { describe, expect, it } from 'vitest';
import { emptyFilter, filterTraffic } from '../src/shared/filterTraffic';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord => ({
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
  responseBody: null,
  durationMs: 10,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...over,
});

describe('filterTraffic', () => {
  const rows = [
    rec({
      id: 1,
      method: 'GET',
      statusCode: 200,
      host: 'api.example.com',
      url: 'https://api.example.com/users',
      path: '/users',
    }),
    rec({
      id: 2,
      method: 'POST',
      statusCode: 404,
      host: 'api.example.com',
      url: 'https://api.example.com/orders',
      path: '/orders',
    }),
    rec({
      id: 3,
      method: 'GET',
      statusCode: 500,
      host: 'cdn.other.com',
      url: 'https://cdn.other.com/img',
      path: '/img',
    }),
  ];

  it('빈 필터는 전체를 반환한다', () => {
    expect(filterTraffic(rows, emptyFilter())).toHaveLength(3);
  });

  it('도메인 부분일치로 거른다', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), domain: 'example' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('메서드로 거른다', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), methods: ['POST'] }).map((r) => r.id)).toEqual([2]);
  });

  it('상태 대역으로 거른다 (4xx,5xx)', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), statusClasses: [4, 5] }).map((r) => r.id)).toEqual([2, 3]);
  });

  it('검색어로 URL/경로를 거른다 (대소문자 무시)', () => {
    expect(filterTraffic(rows, { ...emptyFilter(), search: 'ORDERS' }).map((r) => r.id)).toEqual([2]);
  });

  it('조건을 AND로 결합한다', () => {
    expect(
      filterTraffic(rows, { ...emptyFilter(), methods: ['GET'], statusClasses: [5] }).map((r) => r.id),
    ).toEqual([3]);
  });
});
