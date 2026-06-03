import { describe, expect, it } from 'vitest';
import { matchOverrideRule } from '../src/shared/interception';
import type { OverrideRule } from '../src/shared/types';

const rule = (over: Partial<OverrideRule>): OverrideRule => ({
  id: 1,
  urlPattern: '*/api/users',
  statusCode: 200,
  contentType: 'application/json',
  body: '{"mocked":true}',
  enabled: true,
  ...over,
});

describe('matchOverrideRule', () => {
  it('와일드카드 패턴으로 URL을 매칭한다', () => {
    const matched = matchOverrideRule('https://api.example.com/api/users', [rule({})]);
    expect(matched?.body).toBe('{"mocked":true}');
  });
  it('매칭되는 규칙이 없으면 null', () => {
    expect(matchOverrideRule('https://x/other', [rule({})])).toBeNull();
  });
  it('비활성 규칙은 무시한다', () => {
    expect(matchOverrideRule('https://api.example.com/api/users', [rule({ enabled: false })])).toBeNull();
  });
  it('첫 번째 매칭 규칙을 반환한다', () => {
    const rules = [rule({ id: 1, body: 'first' }), rule({ id: 2, body: 'second' })];
    expect(matchOverrideRule('https://api.example.com/api/users', rules)?.body).toBe('first');
  });
  it('정확한 경로 패턴(앞부분 와일드카드)', () => {
    expect(
      matchOverrideRule('https://a.com/v1/orders', [rule({ urlPattern: '*/v1/orders' })]),
    ).not.toBeNull();
    expect(matchOverrideRule('https://a.com/v1/orders/5', [rule({ urlPattern: '*/v1/orders' })])).toBeNull();
  });
});
