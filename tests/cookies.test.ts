import { describe, expect, it } from 'vitest';
import { parseCookieHeader, parseSetCookie } from '../src/shared/cookies';

describe('parseCookieHeader', () => {
  it('Cookie 헤더를 name/value로 파싱한다', () => {
    expect(parseCookieHeader('a=1; b=2; session=xyz')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
      { name: 'session', value: 'xyz' },
    ]);
  });
  it('빈 문자열은 빈 배열', () => {
    expect(parseCookieHeader('')).toEqual([]);
    expect(parseCookieHeader(undefined)).toEqual([]);
  });
  it('값에 = 가 있어도 첫 = 기준으로 분리', () => {
    expect(parseCookieHeader('token=a=b=c')).toEqual([{ name: 'token', value: 'a=b=c' }]);
  });
});

describe('parseSetCookie', () => {
  it('Set-Cookie의 이름/값과 속성을 분리한다', () => {
    const parsed = parseSetCookie('session=abc; Path=/; HttpOnly; Secure');
    expect(parsed.name).toBe('session');
    expect(parsed.value).toBe('abc');
    expect(parsed.attributes).toContain('Path=/');
    expect(parsed.attributes).toContain('HttpOnly');
  });
});
