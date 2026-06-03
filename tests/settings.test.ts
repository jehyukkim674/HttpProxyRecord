import { describe, expect, it } from 'vitest';
import { SettingsStore, type SettingsBackend } from '../src/main/settings';

/** 인메모리 백엔드 — RecordStore 없이 SettingsStore 단위 테스트. */
class MemoryBackend implements SettingsBackend {
  private readonly map = new Map<string, string>();
  getSetting(key: string): string | undefined {
    return this.map.get(key);
  }
  setSetting(key: string, value: string): void {
    this.map.set(key, value);
  }
  /** 손상된 설정 시뮬레이션용 */
  putRaw(key: string, raw: string): void {
    this.map.set(key, raw);
  }
}

describe('SettingsStore', () => {
  it('값이 없으면 기본값을 돌려준다', () => {
    const store = new SettingsStore(new MemoryBackend());
    expect(store.getThrottle()).toEqual({ enabled: false, latencyMs: 0 });
    expect(store.getOverrideRules()).toEqual([]);
    expect(store.getBreakpointPatterns()).toEqual([]);
    expect(store.getReplayOptions()).toEqual({ applyDelay: false, passthrough: false });
    expect(store.getAlertRule()).toEqual({ enabled: false, statusMin: 500 });
    expect(store.getExcludeDomains()).toEqual([]);
    expect(store.getAiApiKey()).toBeNull();
  });

  it('set 후 get으로 동일 값을 돌려준다 (라운드트립)', () => {
    const store = new SettingsStore(new MemoryBackend());
    store.setThrottle({ enabled: true, latencyMs: 250 });
    expect(store.getThrottle()).toEqual({ enabled: true, latencyMs: 250 });

    store.setReplayOptions({ applyDelay: true, passthrough: true });
    expect(store.getReplayOptions()).toEqual({ applyDelay: true, passthrough: true });

    store.setExcludeDomains(['a.com', 'b.com']);
    expect(store.getExcludeDomains()).toEqual(['a.com', 'b.com']);
  });

  it('재생 옵션은 두 키를 독립적으로 저장한다', () => {
    const store = new SettingsStore(new MemoryBackend());
    store.setReplayOptions({ applyDelay: true, passthrough: false });
    expect(store.getReplayOptions()).toEqual({ applyDelay: true, passthrough: false });
  });

  it('손상된 JSON은 기본값으로 폴백한다 (앱이 막히지 않음)', () => {
    const backend = new MemoryBackend();
    backend.putRaw('throttle', '{이건 JSON이 아님');
    const store = new SettingsStore(backend);
    expect(store.getThrottle()).toEqual({ enabled: false, latencyMs: 0 });
  });

  it('AI 키는 평문으로 저장한다 (JSON 인용부호 없음)', () => {
    const backend = new MemoryBackend();
    const store = new SettingsStore(backend);
    store.setAiApiKey('sk-ant-123');
    expect(store.getAiApiKey()).toBe('sk-ant-123');
    expect(backend.getSetting('aiApiKey')).toBe('sk-ant-123');
  });
});
