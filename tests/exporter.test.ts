import { describe, expect, it } from 'vitest';
import { maskSensitiveHeaders, toCurl, toHar, toMarkdown } from '../src/main/export/exporter';
import type { TrafficRecord } from '../src/shared/types';

const sampleRecord = (overrides: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'POST',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: { 'content-type': 'application/json', authorization: 'Bearer token123' },
  requestBody: '{"name":"홍길동"}',
  statusCode: 201,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"id":1,"name":"홍길동"}',
  durationMs: 55,
  requestSize: 24,
  responseSize: 30,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

describe('toCurl', () => {
  it('메서드/헤더/바디를 포함한 curl 명령을 만든다', () => {
    const curl = toCurl(sampleRecord());

    expect(curl).toContain("curl -X POST 'https://api.example.com/users'");
    expect(curl).toContain("-H 'content-type: application/json'");
    // authorization은 민감 헤더라 마스킹됨 (별도 마스킹 테스트에서 검증)
    expect(curl).toContain("-H 'authorization: ***REDACTED***'");
    expect(curl).toContain(`-d '{"name":"홍길동"}'`);
  });

  it('바디가 없으면 -d 옵션을 생략한다', () => {
    const curl = toCurl(sampleRecord({ requestBody: null, method: 'GET' }));

    expect(curl).toContain('curl -X GET');
    expect(curl).not.toContain('-d ');
  });

  it('호스트 헤더는 curl에서 제외한다', () => {
    const curl = toCurl(sampleRecord({ requestHeaders: { host: 'api.example.com', accept: '*/*' } }));

    expect(curl).not.toContain("-H 'host:");
    expect(curl).toContain("-H 'accept: */*'");
  });

  it('민감 헤더를 마스킹한다', () => {
    const curl = toCurl(sampleRecord());

    expect(curl).toContain("-H 'authorization: ***REDACTED***'");
    expect(curl).not.toContain('Bearer token123');
  });
});

describe('maskSensitiveHeaders', () => {
  it('민감 헤더 값을 REDACTED로 치환한다 (대소문자 무시)', () => {
    const masked = maskSensitiveHeaders({
      Authorization: 'Bearer secret',
      Cookie: 'session=abc',
      'Content-Type': 'application/json',
    });
    expect(masked.Authorization).toBe('***REDACTED***');
    expect(masked.Cookie).toBe('***REDACTED***');
    expect(masked['Content-Type']).toBe('application/json');
  });

  it('set-cookie / x-api-key / x-auth-token / x-csrf-token / proxy-authorization 도 마스킹', () => {
    const masked = maskSensitiveHeaders({
      'set-cookie': 'a=1',
      'x-api-key': 'k',
      'x-auth-token': 't',
      'x-csrf-token': 'c',
      'proxy-authorization': 'p',
    });
    expect(Object.values(masked).every((value) => value === '***REDACTED***')).toBe(true);
  });
});

describe('toHar', () => {
  it('HAR 1.2 형식으로 변환한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: {
        version: string;
        creator: { name: string };
        entries: Array<{
          request: { method: string; url: string; postData?: { text: string } };
          response: { status: number; content: { text: string } };
          time: number;
        }>;
      };
    };

    expect(har.log.version).toBe('1.2');
    expect(har.log.creator.name).toBe('HttpProxyRecord');
    expect(har.log.entries).toHaveLength(1);

    const entry = har.log.entries[0];
    expect(entry.request.method).toBe('POST');
    expect(entry.request.url).toBe('https://api.example.com/users');
    expect(entry.request.postData?.text).toBe('{"name":"홍길동"}');
    expect(entry.response.status).toBe(201);
    expect(entry.response.content.text).toBe('{"id":1,"name":"홍길동"}');
    expect(entry.time).toBe(55);
  });

  it('헤더를 name/value 배열로 변환한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: { entries: Array<{ request: { headers: Array<{ name: string; value: string }> } }> };
    };

    expect(har.log.entries[0].request.headers).toContainEqual({
      name: 'content-type',
      value: 'application/json',
    });
  });

  it('민감 헤더를 마스킹한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: { entries: Array<{ request: { headers: Array<{ name: string; value: string }> } }> };
    };
    const authHeader = har.log.entries[0].request.headers.find(
      (header) => header.name.toLowerCase() === 'authorization',
    );
    expect(authHeader?.value).toBe('***REDACTED***');
  });
});

describe('toMarkdown', () => {
  it('요약 테이블과 상세 섹션을 포함한 마크다운을 만든다', () => {
    const markdown = toMarkdown([sampleRecord()]);

    // 요약 테이블
    expect(markdown).toContain('| # | 시각 | 메서드 | 상태 | URL | 소요(ms) |');
    expect(markdown).toContain('| 1 |');
    expect(markdown).toContain('POST');
    expect(markdown).toContain('https://api.example.com/users');

    // 상세 섹션
    expect(markdown).toContain('## 1. POST https://api.example.com/users');
    expect(markdown).toContain('### 요청');
    expect(markdown).toContain('### 응답 (201, 55ms)');
    expect(markdown).toContain('{"name":"홍길동"}');
  });
});
