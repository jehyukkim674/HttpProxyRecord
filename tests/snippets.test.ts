import { describe, expect, it } from 'vitest';
import { toFetch, toGoSnippet, toPythonRequests } from '../src/shared/snippets';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'POST',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: { 'content-type': 'application/json', host: 'api.example.com' },
  requestBody: '{"name":"x"}',
  statusCode: 201,
  responseHeaders: {},
  responseBody: null,
  durationMs: 10,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '',
  ...over,
});

describe('toPythonRequests', () => {
  it('requests 코드를 생성한다', () => {
    const code = toPythonRequests(rec());
    expect(code).toContain('import requests');
    expect(code).toContain("requests.request('POST', 'https://api.example.com/users'");
    expect(code).toContain("'content-type': 'application/json'");
    expect(code).toContain('data=');
  });
  it('host 헤더는 제외', () => {
    expect(toPythonRequests(rec())).not.toContain("'host'");
  });
});

describe('toFetch', () => {
  it('JS fetch 코드를 생성한다', () => {
    const code = toFetch(rec());
    expect(code).toContain("fetch('https://api.example.com/users'");
    expect(code).toContain("method: 'POST'");
    expect(code).toContain('body:');
  });
  it('GET은 body를 생략', () => {
    expect(toFetch(rec({ method: 'GET', requestBody: null }))).not.toContain('body:');
  });
});

describe('toGoSnippet', () => {
  it('Go net/http 코드를 생성한다', () => {
    const code = toGoSnippet(rec());
    expect(code).toContain('package main');
    expect(code).toContain('http.NewRequest("POST"');
    expect(code).toContain('api.example.com/users');
  });
});
