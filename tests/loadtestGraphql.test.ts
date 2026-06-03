import { describe, expect, it } from 'vitest';
import { toK6Script } from '../src/shared/loadtest';
import { parseGraphQL } from '../src/shared/graphql';
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
  clientIp: '',
  ...over,
});

describe('toK6Script', () => {
  it('k6 스크립트를 생성한다', () => {
    const script = toK6Script([rec(), rec({ method: 'POST', url: 'https://a/x', requestBody: '{"a":1}' })]);
    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain('export default function');
    expect(script).toContain("http.get('https://api.example.com/users')");
    expect(script).toContain("http.post('https://a/x'");
  });
});

describe('parseGraphQL', () => {
  it('GraphQL 요청을 식별하고 operation을 파싱한다', () => {
    const body = JSON.stringify({ query: 'query GetUser { user { id } }', operationName: 'GetUser' });
    const parsed = parseGraphQL(body);
    expect(parsed?.isGraphQL).toBe(true);
    expect(parsed?.operationName).toBe('GetUser');
    expect(parsed?.operationType).toBe('query');
  });

  it('mutation을 식별한다', () => {
    const parsed = parseGraphQL(JSON.stringify({ query: 'mutation AddUser { addUser { id } }' }));
    expect(parsed?.operationType).toBe('mutation');
  });

  it('GraphQL이 아니면 null', () => {
    expect(parseGraphQL('{"name":"x"}')).toBeNull();
    expect(parseGraphQL(null)).toBeNull();
    expect(parseGraphQL('not json')).toBeNull();
  });
});
