import { describe, expect, it } from 'vitest';
import { auditAgainstOpenApi } from '../src/shared/analysis/openapiAudit';
import type { TrafficRecord } from '../src/shared/types';

let nextId = 1;
const rec = (method: string, path: string): TrafficRecord =>
  ({
    id: nextId++,
    sessionId: 1,
    timestamp: '',
    method,
    url: `http://x${path}`,
    host: 'x',
    path,
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
  }) as TrafficRecord;

const spec = {
  paths: {
    '/users': { get: {} },
    '/users/{id}': { get: {} },
  },
};

describe('auditAgainstOpenApi', () => {
  it('문서화된 경로/메서드는 통과', () => {
    expect(auditAgainstOpenApi(spec, [rec('GET', '/users')])).toEqual([]);
  });

  it('경로 템플릿 {id}를 매칭한다', () => {
    expect(auditAgainstOpenApi(spec, [rec('GET', '/users/42')])).toEqual([]);
  });

  it('스펙에 없는 경로는 undocumented', () => {
    const findings = auditAgainstOpenApi(spec, [rec('GET', '/orders')]);
    expect(findings[0].rule).toBe('openapi.undocumented');
  });

  it('경로는 있으나 메서드가 없으면 method-undocumented', () => {
    const findings = auditAgainstOpenApi(spec, [rec('POST', '/users')]);
    expect(findings[0].rule).toBe('openapi.method-undocumented');
  });

  it('쿼리스트링은 무시하고 경로만 본다', () => {
    expect(auditAgainstOpenApi(spec, [rec('GET', '/users?page=1')])).toEqual([]);
  });

  it('동일 method+path는 한 번만 보고', () => {
    const findings = auditAgainstOpenApi(spec, [rec('GET', '/orders'), rec('GET', '/orders')]);
    expect(findings).toHaveLength(1);
  });
});
