import type { GuideBox } from './types';

/** 새 박스 번호 = 현재 최대 + 1 (삭제 후에도 충돌 없음). */
export const nextBoxNumber = (boxes: GuideBox[]): number =>
  boxes.reduce((max, box) => Math.max(max, box.number), 0) + 1;

/** HTML 내보내기용 평탄화 스텝 (이미지에 박스가 이미 그려진 상태). */
export type FlatStep = {
  imageDataUrl: string;
  caption?: string;
  items: Array<{ number: number; description: string }>;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 평탄화 스텝들로 자체완결 HTML 가이드 문서를 만든다. 순수함수. */
export const buildGuideHtml = (title: string, steps: FlatStep[]): string => {
  const stepsHtml = steps
    .map((step, index) => {
      const items = [...step.items]
        .sort((a, b) => a.number - b.number)
        .map(
          (item) =>
            `<li><span class="num">${item.number}</span><span>${escapeHtml(item.description)}</span></li>`,
        )
        .join('');
      const caption = step.caption ? ` — ${escapeHtml(step.caption)}` : '';
      return `<section class="step"><h2>Step ${index + 1}${caption}</h2><img src="${step.imageDataUrl}" alt="step ${index + 1}" />${items ? `<ol class="callouts">${items}</ol>` : ''}</section>`;
    })
    .join('\n');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font-family:-apple-system,system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#222}
h1{border-bottom:2px solid #eee;padding-bottom:8px}
.step{margin:32px 0}
.step img{max-width:100%;border:1px solid #ddd;border-radius:6px}
.callouts{list-style:none;padding:0}
.callouts li{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
.num{flex:0 0 22px;height:22px;border-radius:50%;background:#1677ff;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px}
</style></head><body><h1>${escapeHtml(title)}</h1>${stepsHtml}</body></html>`;
};
