import { log } from './logger';
import type { InterceptScript, OverrideRule, ThrottleConfig } from '../shared/types';

/**
 * 키-값 설정 백엔드. RecordStore가 구현하며, 테스트에서는 인메모리 맵으로 대체할 수 있다.
 * SettingsStore가 이 위에서 타입·기본값·직렬화를 담당한다.
 */
export interface SettingsBackend {
  // RecordStore는 null, 인메모리 Map 백엔드는 undefined를 돌려주므로 둘 다 수용한다.
  getSetting(key: string): string | null | undefined;
  setSetting(key: string, value: string): void;
}

export type AlertRule = { enabled: boolean; statusMin: number };
export type ReplayOptions = { applyDelay: boolean; passthrough: boolean };

const DEFAULT_THROTTLE: ThrottleConfig = { enabled: false, latencyMs: 0 };
const DEFAULT_ALERT: AlertRule = { enabled: false, statusMin: 500 };

/**
 * 타입드 설정 파사드.
 *
 * 설정 키·기본값·(역)직렬화를 한 곳에 모은다. 설정을 추가할 때는 이 클래스에 getter/setter
 * 한 쌍만 더하면 되고, 키 문자열이 코드 곳곳에 흩어지지 않는다.
 *
 * 값은 JSON 문자열로 저장되며, 파싱이 실패하면 기본값으로 폴백하고 경고를 남긴다
 * (손상된 설정 한 줄이 앱을 막지 않도록).
 */
export class SettingsStore {
  constructor(private readonly backend: SettingsBackend) {}

  private read<T>(key: string, fallback: T): T {
    const raw = this.backend.getSetting(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      log.warn(`설정 '${key}' 파싱 실패 — 기본값 사용`, error);
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    this.backend.setSetting(key, JSON.stringify(value));
  }

  // 오버라이드 규칙 (#4)
  getOverrideRules(): OverrideRule[] {
    return this.read<OverrideRule[]>('overrideRules', []);
  }
  setOverrideRules(rules: OverrideRule[]): void {
    this.write('overrideRules', rules);
  }

  // 네트워크 throttle (#7)
  getThrottle(): ThrottleConfig {
    return this.read<ThrottleConfig>('throttle', DEFAULT_THROTTLE);
  }
  setThrottle(config: ThrottleConfig): void {
    this.write('throttle', config);
  }

  // 브레이크포인트 패턴 (#3)
  getBreakpointPatterns(): string[] {
    return this.read<string[]>('breakpointPatterns', []);
  }
  setBreakpointPatterns(patterns: string[]): void {
    this.write('breakpointPatterns', patterns);
  }

  // 재생 옵션 (#16 지연 / #17 패스스루)
  getReplayOptions(): ReplayOptions {
    return {
      applyDelay: this.read<boolean>('replayApplyDelay', false),
      passthrough: this.read<boolean>('replayPassthrough', false),
    };
  }
  setReplayOptions(options: ReplayOptions): void {
    this.write('replayApplyDelay', options.applyDelay);
    this.write('replayPassthrough', options.passthrough);
  }

  // 조건부 알림 (#30)
  getAlertRule(): AlertRule {
    return this.read<AlertRule>('alertRule', DEFAULT_ALERT);
  }
  setAlertRule(rule: AlertRule): void {
    this.write('alertRule', rule);
  }

  // 캡처 제외 도메인
  getExcludeDomains(): string[] {
    return this.read<string[]>('excludeDomains', []);
  }
  setExcludeDomains(domains: string[]): void {
    this.write('excludeDomains', domains);
  }

  // 스크립트 인터셉션
  getScripts(): InterceptScript[] {
    return this.read<InterceptScript[]>('interceptScripts', []);
  }
  setScripts(scripts: InterceptScript[]): void {
    this.write('interceptScripts', scripts);
  }

  // AI API 키 — 민감값이라 JSON이 아닌 평문으로 저장한다 (AIService가 () => string | null을 기대)
  getAiApiKey(): string | null {
    return this.backend.getSetting('aiApiKey') ?? null;
  }
  setAiApiKey(key: string): void {
    this.backend.setSetting('aiApiKey', key);
  }
}
