import { describe, expect, it } from 'vitest';
import { parseHar } from '../src/main/export/harImport';

const SAMPLE_HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: '2026-06-03T10:00:00.000Z',
        time: 42,
        request: {
          method: 'GET',
          url: 'https://api.example.com/users?page=1',
          headers: [{ name: 'accept', value: 'application/json' }],
        },
        response: {
          status: 200,
          headers: [{ name: 'content-type', value: 'application/json' }],
          content: { text: '{"users":[]}' },
        },
      },
    ],
  },
});

describe('parseHar', () => {
  it('HAR 엔트리를 CapturedTraffic으로 변환한다', () => {
    const traffic = parseHar(SAMPLE_HAR);
    expect(traffic).toHaveLength(1);
    expect(traffic[0].method).toBe('GET');
    expect(traffic[0].host).toBe('api.example.com');
    expect(traffic[0].path).toBe('/users?page=1');
    expect(traffic[0].statusCode).toBe(200);
    expect(traffic[0].responseBody).toBe('{"users":[]}');
    expect(traffic[0].requestHeaders.accept).toBe('application/json');
    expect(traffic[0].durationMs).toBe(42);
  });

  it('잘못된 HAR이면 에러를 던진다', () => {
    expect(() => parseHar('not json')).toThrow();
    expect(() => parseHar('{}')).toThrow('유효한 HAR');
  });
});
