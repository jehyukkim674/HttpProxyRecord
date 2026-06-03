import { describe, expect, it } from 'vitest';
import { auditSecurity } from '../src/shared/analysis/securityAudit';
import { analyzeCache } from '../src/shared/analysis/cacheAnalysis';
import { analyzeSession, summarizeFindings } from '../src/shared/analysis/sessionAnalysis';
import type { TrafficRecord } from '../src/shared/types';

let nextId = 1;
const rec = (p: Partial<TrafficRecord>): TrafficRecord =>
  ({
    id: nextId++,
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

describe('auditSecurity', () => {
  it('HTML 응답에 CSP 없으면 경고', () => {
    const findings = auditSecurity(rec({ responseHeaders: { 'content-type': 'text/html' } }));
    expect(findings.some((f) => f.rule === 'security.csp-missing')).toBe(true);
  });

  it('Set-Cookie에 Secure/HttpOnly 없으면 경고', () => {
    const findings = auditSecurity(rec({ responseHeaders: { 'set-cookie': 'sid=abc; Path=/' } }));
    expect(findings.some((f) => f.rule === 'security.cookie-insecure')).toBe(true);
    expect(findings.some((f) => f.rule === 'security.cookie-no-httponly')).toBe(true);
  });

  it('CORS 와일드카드는 info', () => {
    const findings = auditSecurity(rec({ responseHeaders: { 'access-control-allow-origin': '*' } }));
    expect(findings.find((f) => f.rule === 'security.cors-wildcard')?.severity).toBe('info');
  });
});

describe('analyzeCache', () => {
  it('큰 압축 가능 본문이 미압축이면 경고', () => {
    const body = 'a'.repeat(60_000);
    const findings = analyzeCache(
      rec({
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: body,
        responseSize: 60_000,
      }),
    );
    expect(findings.some((f) => f.rule === 'cache.uncompressed')).toBe(true);
  });

  it('정적 자산에 캐시 미설정이면 info', () => {
    const findings = analyzeCache(
      rec({ responseHeaders: { 'content-type': 'image/png' }, responseBody: 'x', responseSize: 1 }),
    );
    expect(findings.some((f) => f.rule === 'cache.no-cache')).toBe(true);
  });
});

describe('analyzeSession', () => {
  it('동일 요청 5회 이상이면 N+1 경고', () => {
    const records = Array.from({ length: 5 }, () => rec({ url: 'http://api/users/1', path: '/users/1' }));
    const findings = analyzeSession(records);
    expect(findings.some((f) => f.rule === 'perf.duplicate')).toBe(true);
  });

  it('느린/큰 응답을 성능 예산 위반으로 표시', () => {
    const findings = analyzeSession([rec({ durationMs: 2000, responseSize: 2_000_000 })]);
    expect(findings.some((f) => f.rule === 'perf.slow')).toBe(true);
    expect(findings.some((f) => f.rule === 'perf.large')).toBe(true);
  });

  it('레코드별 시크릿도 합산하고 심각도 요약을 만든다', () => {
    const findings = analyzeSession([rec({ responseBody: 'AKIAIOSFODNN7EXAMPLE' })]);
    expect(findings.some((f) => f.rule === 'secret.aws-access-key')).toBe(true);
    const summary = summarizeFindings(findings);
    expect(summary.high).toBeGreaterThanOrEqual(1);
  });
});
