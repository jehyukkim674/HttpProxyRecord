import { describe, expect, it } from 'vitest';
import { isNewerVersion, resolveUpdateCheck } from '../src/main/system/updater';

describe('isNewerVersion', () => {
  it('상위 버전이면 true', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
  });

  it('같거나 낮은 버전이면 false', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
  });

  it('앞의 v 접두사를 무시한다', () => {
    expect(isNewerVersion('v0.1.1', '0.1.0')).toBe(true);
  });
});

describe('resolveUpdateCheck', () => {
  it('새 버전이 있으면 available — Windows는 자동 설치 가능', async () => {
    const result = await resolveUpdateCheck(async () => ({ version: '0.1.1', notes: '버그수정' }), 'win32');
    expect(result).toEqual({
      kind: 'available',
      version: '0.1.1',
      notes: '버그수정',
      canAutoInstall: true,
    });
  });

  it('무서명 macOS는 자동 설치 불가(canAutoInstall=false)', async () => {
    const result = await resolveUpdateCheck(async () => ({ version: '0.1.1' }), 'darwin');
    expect(result.kind).toBe('available');
    if (result.kind === 'available') {
      expect(result.canAutoInstall).toBe(false);
    }
  });

  it('업데이트가 없으면 latest', async () => {
    const result = await resolveUpdateCheck(async () => null, 'darwin');
    expect(result).toEqual({ kind: 'latest' });
  });

  it('확인 중 예외가 나면 error로 메시지를 담아 반환', async () => {
    const result = await resolveUpdateCheck(async () => {
      throw new Error('error sending request');
    }, 'win32');
    expect(result).toEqual({ kind: 'error', message: 'error sending request' });
  });
});
