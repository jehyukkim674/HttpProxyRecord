import { describe, expect, it } from 'vitest';
import { decodeJwt, findBearerToken } from '../src/shared/jwt';

// header={"alg":"HS256","typ":"JWT"} payload={"sub":"123","name":"홍길동","exp":4102444800}
const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjMiLCJuYW1lIjoiSnVuIiwiZXhwIjo0MTAyNDQ0ODAwfQ' +
  '.signature';

describe('decodeJwt', () => {
  it('헤더/페이로드를 디코드한다', () => {
    const decoded = decodeJwt(SAMPLE_JWT);
    expect(decoded).not.toBeNull();
    expect(decoded!.header.alg).toBe('HS256');
    expect(decoded!.payload.sub).toBe('123');
    expect(decoded!.payload.name).toBe('Jun');
  });

  it('exp를 만료 일시로 해석한다', () => {
    const decoded = decodeJwt(SAMPLE_JWT);
    expect(decoded!.expiresAt).toBe(new Date(4102444800 * 1000).toISOString());
  });

  it('JWT 형식이 아니면 null', () => {
    expect(decodeJwt('not.a.jwt!')).toBeNull();
    expect(decodeJwt('only.two')).toBeNull();
    expect(decodeJwt('')).toBeNull();
  });
});

describe('findBearerToken', () => {
  it('Authorization 헤더에서 Bearer 토큰을 추출한다', () => {
    expect(findBearerToken({ authorization: 'Bearer abc.def.ghi' })).toBe('abc.def.ghi');
  });
  it('대소문자 무시 (Authorization/authorization)', () => {
    expect(findBearerToken({ Authorization: 'Bearer xyz' })).toBe('xyz');
  });
  it('Bearer 없으면 null', () => {
    expect(findBearerToken({ 'content-type': 'application/json' })).toBeNull();
    expect(findBearerToken({ authorization: 'Basic dXNlcg==' })).toBeNull();
  });
});
