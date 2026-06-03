import type { LineDiff, ResponseComparison } from './types';

/** LCS 기반 라인 단위 diff. */
export const diffLines = (a: string, b: string): LineDiff[] => {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length;
  const n = bLines.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      lcs[i][j] = aLines[i] === bLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: LineDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: 'same', text: aLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', text: aLines[i] });
      i += 1;
    } else {
      result.push({ type: 'added', text: bLines[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: aLines[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: 'added', text: bLines[j] });
    j += 1;
  }
  return result;
};

/** 두 응답(상태코드+본문) 비교. #25 세션비교·#26 스냅샷 공통. */
export const compareResponses = (
  a: { statusCode: number; body: string },
  b: { statusCode: number; body: string },
): ResponseComparison => ({
  statusChanged: a.statusCode !== b.statusCode,
  statusA: a.statusCode,
  statusB: b.statusCode,
  bodyDiff: diffLines(a.body, b.body),
});
