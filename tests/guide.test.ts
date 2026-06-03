import { describe, expect, it } from 'vitest';
import { buildGuideHtml, nextBoxNumber } from '../src/shared/guide';
import type { GuideBox } from '../src/shared/types';

const box = (number: number): GuideBox => ({
  id: `b${number}`,
  x: 0,
  y: 0,
  w: 0.1,
  h: 0.1,
  number,
  description: '',
  kind: 'box',
});

describe('nextBoxNumber', () => {
  it('빈 배열이면 1', () => {
    expect(nextBoxNumber([])).toBe(1);
  });
  it('최대 번호 + 1 (삭제 후에도 충돌 없음)', () => {
    expect(nextBoxNumber([box(1), box(3)])).toBe(4);
  });
});

describe('buildGuideHtml', () => {
  it('제목과 스텝/이미지/번호 설명을 포함한다', () => {
    const html = buildGuideHtml('로그인 가이드', [
      {
        imageDataUrl: 'data:image/png;base64,AAA',
        items: [
          { number: 2, description: '비밀번호 입력' },
          { number: 1, description: '아이디 입력' },
        ],
      },
    ]);
    expect(html).toContain('<title>로그인 가이드</title>');
    expect(html).toContain('Step 1');
    expect(html).toContain('src="data:image/png;base64,AAA"');
    // 번호순 정렬: 1이 2보다 먼저
    expect(html.indexOf('아이디 입력')).toBeLessThan(html.indexOf('비밀번호 입력'));
  });

  it('HTML 특수문자를 이스케이프한다', () => {
    const html = buildGuideHtml('<b>x</b>', [
      { imageDataUrl: 'data:,', items: [{ number: 1, description: '<script>alert(1)</script>' }] },
    ]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('caption이 있으면 스텝 제목에 붙인다', () => {
    const html = buildGuideHtml('G', [{ imageDataUrl: 'data:,', caption: '로그인 화면', items: [] }]);
    expect(html).toContain('Step 1 — 로그인 화면');
  });
});
