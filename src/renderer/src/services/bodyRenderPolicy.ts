/**
 * 대용량 본문 렌더 정책 — 렌더러 프리징 방지.
 * 임계치(RENDER_LIMIT)를 넘는 본문은 앞부분만 잘라 렌더하고,
 * 사용자가 [전체 보기]를 누르면 forceFull로 임계치를 무시한다.
 */
export const RENDER_LIMIT = 2 * 1024 * 1024; // 2MB

export type BodyRenderPolicy = {
  /** 본문이 잘려서 표시되는지 */
  truncated: boolean;
  /** 실제로 렌더할 문자 수 */
  renderLength: number;
  /** 트리/Pretty 자동 파싱을 허용할지 (대용량이면 비용 회피로 false) */
  allowParse: boolean;
};

export const bodyRenderPolicy = (length: number, forceFull: boolean): BodyRenderPolicy => {
  if (forceFull || length <= RENDER_LIMIT) {
    return { truncated: false, renderLength: length, allowParse: true };
  }
  return { truncated: true, renderLength: RENDER_LIMIT, allowParse: false };
};

/** 바이트 수를 사람이 읽기 쉬운 단위로 (B/KB/MB) */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};
