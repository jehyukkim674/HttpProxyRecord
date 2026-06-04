import { describe, expect, it } from 'vitest';
import { RENDER_LIMIT, bodyRenderPolicy, formatBytes } from './bodyRenderPolicy';

describe('bodyRenderPolicy', () => {
  it('임계치 이하면 전체 렌더 + 파싱 허용', () => {
    expect(bodyRenderPolicy(1000, false)).toEqual({
      truncated: false,
      renderLength: 1000,
      allowParse: true,
    });
  });

  it('임계치 정확히 같으면 전체 렌더', () => {
    expect(bodyRenderPolicy(RENDER_LIMIT, false)).toEqual({
      truncated: false,
      renderLength: RENDER_LIMIT,
      allowParse: true,
    });
  });

  it('임계치 초과면 잘라서 렌더 + 파싱 비활성', () => {
    const huge = RENDER_LIMIT + 1;
    expect(bodyRenderPolicy(huge, false)).toEqual({
      truncated: true,
      renderLength: RENDER_LIMIT,
      allowParse: false,
    });
  });

  it('forceFull이면 임계치를 무시하고 전체 렌더', () => {
    const huge = 10 * 1024 * 1024;
    expect(bodyRenderPolicy(huge, true)).toEqual({
      truncated: false,
      renderLength: huge,
      allowParse: true,
    });
  });
});

describe('formatBytes', () => {
  it('B/KB/MB 단위로 표기', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0MB');
  });
});
