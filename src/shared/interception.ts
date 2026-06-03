import type { OverrideRule } from './types';

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

/** URL이 활성 오버라이드 규칙 중 하나와 매칭되면 그 규칙을 반환한다 (첫 매칭). */
export const matchOverrideRule = (url: string, rules: OverrideRule[]): OverrideRule | null => {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (globToRegExp(rule.urlPattern).test(url)) return rule;
  }
  return null;
};
