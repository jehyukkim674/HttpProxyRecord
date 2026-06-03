import { describe, expect, it } from 'vitest';
import { extractByDotPath, substituteVariables } from '../src/shared/composer';

describe('substituteVariables', () => {
  it('{{var}}를 값으로 치환한다', () => {
    expect(substituteVariables('Bearer {{token}}', { token: 'abc' })).toBe('Bearer abc');
  });
  it('여러 변수를 치환한다', () => {
    expect(substituteVariables('{{a}}/{{b}}', { a: '1', b: '2' })).toBe('1/2');
  });
  it('미정의 변수는 원문을 유지한다', () => {
    expect(substituteVariables('{{missing}}', {})).toBe('{{missing}}');
  });
  it('변수가 없으면 원문 그대로', () => {
    expect(substituteVariables('no vars', { x: '1' })).toBe('no vars');
  });
});

describe('extractByDotPath', () => {
  it('중첩 객체 경로를 추출한다', () => {
    expect(extractByDotPath({ data: { token: 'xyz' } }, 'data.token')).toBe('xyz');
  });
  it('배열 인덱스 경로를 추출한다', () => {
    expect(extractByDotPath({ items: [{ id: 7 }] }, 'items.0.id')).toBe('7');
  });
  it('도달 실패 시 null', () => {
    expect(extractByDotPath({ a: 1 }, 'a.b.c')).toBeNull();
    expect(extractByDotPath({}, 'missing')).toBeNull();
  });
  it('객체/배열은 JSON 문자열로 반환한다', () => {
    expect(extractByDotPath({ a: { b: 1 } }, 'a')).toBe('{"b":1}');
  });
  it('boolean/number를 문자열로 반환한다', () => {
    expect(extractByDotPath({ ok: true }, 'ok')).toBe('true');
    expect(extractByDotPath({ n: 0 }, 'n')).toBe('0');
  });
});
