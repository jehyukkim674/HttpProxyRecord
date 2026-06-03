import { describe, expect, it } from 'vitest';
import { compareResponses, diffLines } from '../src/shared/diff';

describe('diffLines', () => {
  it('동일하면 모두 same', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
  });
  it('추가된 라인을 added로', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
  });
  it('삭제된 라인을 removed로', () => {
    expect(diffLines('a\nb', 'a')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
    ]);
  });
  it('변경을 removed+added로', () => {
    const d = diffLines('x', 'y');
    expect(d).toContainEqual({ type: 'removed', text: 'x' });
    expect(d).toContainEqual({ type: 'added', text: 'y' });
  });
});

describe('compareResponses', () => {
  it('상태/본문 동일이면 변경 없음', () => {
    const c = compareResponses({ statusCode: 200, body: 'ok' }, { statusCode: 200, body: 'ok' });
    expect(c.statusChanged).toBe(false);
    expect(c.bodyDiff.every((d) => d.type === 'same')).toBe(true);
  });
  it('상태 변경 감지', () => {
    const c = compareResponses({ statusCode: 200, body: 'x' }, { statusCode: 500, body: 'x' });
    expect(c.statusChanged).toBe(true);
    expect(c.statusA).toBe(200);
    expect(c.statusB).toBe(500);
  });
  it('본문 차이 감지', () => {
    const c = compareResponses({ statusCode: 200, body: 'a\nb' }, { statusCode: 200, body: 'a\nc' });
    expect(c.bodyDiff.some((d) => d.type === 'removed' && d.text === 'b')).toBe(true);
    expect(c.bodyDiff.some((d) => d.type === 'added' && d.text === 'c')).toBe(true);
  });
});
