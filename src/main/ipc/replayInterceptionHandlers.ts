import type { AppContext } from '../appContext';
import { buildPairingQr } from '../system/mobilePairing';
import { handle } from './handle';
import type { OverrideRule, ThrottleConfig } from '../../shared/types';

/** 재생, 오버라이드/throttle/브레이크포인트, 조건부 알림, 모바일 QR. */
export const registerReplayInterceptionHandlers = (context: AppContext): void => {
  // 재생 (#16 #17)
  handle('replay:start', (_event, sessionId: number, port: number) => context.startReplay(sessionId, port));
  handle('replay:stop', () => context.stopReplay());
  handle('replay:status', () => context.getReplayStatus());
  handle('replay:get-options', () => context.getReplayOptions());
  handle('replay:set-options', (_event, options: { applyDelay: boolean; passthrough: boolean }) =>
    context.setReplayOptions(options),
  );

  // 인터셉션 (#4 오버라이드 / #7 throttle / #3 브레이크포인트)
  handle('override:list', () => context.getOverrideRules());
  handle('override:set', (_event, rules: OverrideRule[]) => context.setOverrideRules(rules));
  handle('throttle:get', () => context.getThrottle());
  handle('throttle:set', (_event, config: ThrottleConfig) => context.setThrottle(config));
  handle('breakpoint:patterns:get', () => context.getBreakpointPatterns());
  handle('breakpoint:patterns:set', (_event, patterns: string[]) => context.setBreakpointPatterns(patterns));
  handle('breakpoint:resolve', (_event, id: number, action: 'forward' | 'block') => {
    context.resolveBreakpoint(id, action);
    return { resolved: true };
  });

  // 조건부 알림 (#30)
  handle('alert:get', () => context.getAlertRule());
  handle('alert:set', (_event, rule: { enabled: boolean; statusMin: number }) => context.setAlertRule(rule));

  // 모바일 페어링 QR (#31)
  handle('pairing:qr', () => buildPairingQr(context.getProxyStatus().port ?? 8888));
};
