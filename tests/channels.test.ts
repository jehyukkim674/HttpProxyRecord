import { describe, expect, it } from 'vitest';
import { CH, EV } from '../src/shared/channels';

describe('IPC 채널 상수', () => {
  it('모든 채널 문자열은 고유하다 (복붙 시 두 핸들러 충돌 방지)', () => {
    const all = [...Object.values(CH), ...Object.values(EV)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('invoke 채널과 push 이벤트는 겹치지 않는다', () => {
    const invokeChannels = new Set<string>(Object.values(CH));
    for (const event of Object.values(EV)) {
      expect(invokeChannels.has(event)).toBe(false);
    }
  });
});
