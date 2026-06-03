import { describe, expect, it } from 'vitest';
import { matchExcludeDomain } from '../src/main/proxy/excludeFilter';

describe('matchExcludeDomain', () => {
  it('정확히 일치하는 도메인을 매칭한다', () => {
    expect(matchExcludeDomain('api.example.com', ['api.example.com'])).toBe(true);
    expect(matchExcludeDomain('api.example.com', ['other.com'])).toBe(false);
  });

  it('와일드카드 패턴을 매칭한다', () => {
    expect(matchExcludeDomain('www.google-analytics.com', ['*.google-analytics.com'])).toBe(true);
    expect(matchExcludeDomain('google-analytics.com', ['*.google-analytics.com'])).toBe(false);
  });

  it('host에 포트가 붙어도 매칭한다', () => {
    expect(matchExcludeDomain('api.example.com:443', ['api.example.com'])).toBe(true);
  });

  it('패턴이 없으면 항상 false', () => {
    expect(matchExcludeDomain('api.example.com', [])).toBe(false);
  });

  it('공백 패턴은 무시한다', () => {
    expect(matchExcludeDomain('api.example.com', ['  ', ''])).toBe(false);
  });

  it('대소문자를 무시한다', () => {
    expect(matchExcludeDomain('API.Example.COM', ['api.example.com'])).toBe(true);
  });
});
