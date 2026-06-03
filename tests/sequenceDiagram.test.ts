import { describe, expect, it } from 'vitest';
import { toMermaidSequence } from '../src/shared/sequenceDiagram';
import type { TrafficRecord } from '../src/shared/types';

const rec = (p: Partial<TrafficRecord>): TrafficRecord =>
  ({
    id: 1,
    sessionId: 1,
    timestamp: '',
    method: 'GET',
    url: 'http://x/a',
    host: 'x',
    path: '/a',
    requestHeaders: {},
    requestBody: null,
    statusCode: 200,
    responseHeaders: {},
    responseBody: null,
    durationMs: 0,
    requestSize: 0,
    responseSize: 0,
    isHttps: false,
    clientIp: '',
    ...p,
  }) as TrafficRecord;

describe('toMermaidSequence', () => {
  it('빈 세션은 헤더만', () => {
    expect(toMermaidSequence([])).toBe('sequenceDiagram\n  participant C as Client');
  });

  it('요청/응답을 화살표로 그린다', () => {
    const out = toMermaidSequence([
      rec({ host: 'api.test', method: 'POST', path: '/login', statusCode: 201 }),
    ]);
    expect(out).toContain('participant H1 as api.test');
    expect(out).toContain('C->>H1: POST /login');
    expect(out).toContain('H1-->>C: 201');
  });

  it('호스트별로 participant를 구분한다', () => {
    const out = toMermaidSequence([rec({ host: 'a.com' }), rec({ host: 'b.com' })]);
    expect(out).toContain('participant H1 as a.com');
    expect(out).toContain('participant H2 as b.com');
  });

  it('limit으로 길이를 제한한다', () => {
    const records = Array.from({ length: 100 }, () => rec({}));
    const out = toMermaidSequence(records, 10);
    expect(out.split('\n').filter((l) => l.includes('C->>')).length).toBe(10);
  });
});
