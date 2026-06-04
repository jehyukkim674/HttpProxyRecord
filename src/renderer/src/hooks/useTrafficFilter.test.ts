// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTrafficFilter } from './useTrafficFilter';
import type { TrafficRecord } from '../../../shared/types';

const makeRecord = (over: Partial<TrafficRecord>): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-04T00:00:00Z',
  method: 'GET',
  url: 'https://api.example.com/a',
  host: 'api.example.com',
  path: '/a',
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  responseHeaders: {},
  responseBody: null,
  durationMs: 1,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...over,
});

describe('useTrafficFilter', () => {
  const records = [makeRecord({ id: 1, method: 'GET' }), makeRecord({ id: 2, method: 'POST' })];

  it('기본 필터는 전체를 통과시킨다', () => {
    const { result } = renderHook(() => useTrafficFilter(records));
    expect(result.current.filtered).toHaveLength(2);
  });

  it('setFilter로 거른 결과가 반영된다', () => {
    const { result } = renderHook(() => useTrafficFilter(records));
    act(() => result.current.setFilter({ ...result.current.filter, methods: ['POST'] }));
    expect(result.current.filtered.map((r) => r.id)).toEqual([2]);
  });
});
