import { describe, expect, it } from 'vitest';
import { scanSecrets } from '../src/shared/analysis/secretScan';
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

describe('scanSecrets', () => {
  it('본문의 AWS Access Key를 탐지한다', () => {
    const findings = scanSecrets(rec({ responseBody: 'key=AKIAIOSFODNN7EXAMPLE done' }));
    expect(findings.some((f) => f.rule === 'secret.aws-access-key')).toBe(true);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].recordId).toBe(1);
  });

  it('Authorization 헤더의 JWT를 탐지한다', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N';
    const findings = scanSecrets(rec({ requestHeaders: { authorization: `Bearer ${jwt}` } }));
    expect(findings.some((f) => f.rule === 'secret.jwt')).toBe(true);
  });

  it('응답 본문의 PEM 개인 키를 탐지한다', () => {
    const findings = scanSecrets(rec({ responseBody: '-----BEGIN RSA PRIVATE KEY-----\nMII...' }));
    expect(findings.some((f) => f.rule === 'secret.private-key')).toBe(true);
  });

  it('시크릿이 없으면 빈 배열', () => {
    expect(scanSecrets(rec({ responseBody: '{"ok":true}' }))).toEqual([]);
  });
});
