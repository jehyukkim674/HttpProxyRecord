import { describe, expect, it } from 'vitest';
import { toOpenApi, toPostmanCollection } from '../src/main/export/postmanOpenApi';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users/123',
  host: 'api.example.com',
  path: '/users/123',
  requestHeaders: { accept: 'application/json' },
  requestBody: null,
  statusCode: 200,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"id":123}',
  durationMs: 10,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '',
  ...over,
});

describe('toPostmanCollection', () => {
  it('Postman v2.1 컬렉션을 만든다', () => {
    const col = toPostmanCollection('내 세션', [rec()]) as {
      info: { name: string; schema: string };
      item: Array<{ name: string; request: { method: string; url: { raw: string } } }>;
    };
    expect(col.info.name).toBe('내 세션');
    expect(col.info.schema).toContain('v2.1.0');
    expect(col.item).toHaveLength(1);
    expect(col.item[0].request.method).toBe('GET');
    expect(col.item[0].request.url.raw).toBe('https://api.example.com/users/123');
  });
});

describe('toOpenApi', () => {
  it('숫자 경로를 파라미터화한다', () => {
    const spec = toOpenApi([rec()]) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/users/{id}']).toBeDefined();
    expect(spec.paths['/users/{id}'].get).toBeDefined();
  });
  it('상태코드별 응답을 정의한다', () => {
    const spec = toOpenApi([rec({ statusCode: 404 })]) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    expect(spec.paths['/users/{id}'].get.responses['404']).toBeDefined();
  });
});
