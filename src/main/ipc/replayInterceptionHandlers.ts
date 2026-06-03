import type { AppContext } from '../appContext';
import { buildPairingQr } from '../system/mobilePairing';
import { CH } from '../../shared/channels';
import { handle } from './handle';
import type { OverrideRule, ThrottleConfig } from '../../shared/types';

/** 재생, 오버라이드/throttle/브레이크포인트, 조건부 알림, 모바일 QR. */
export const registerReplayInterceptionHandlers = (context: AppContext): void => {
  // 재생 (#16 #17)
  handle(CH.replayStart, (_event, sessionId: number, port: number) => context.startReplay(sessionId, port));
  handle(CH.replayStop, () => context.stopReplay());
  handle(CH.replayStatus, () => context.getReplayStatus());
  handle(CH.replayGetOptions, () => context.getReplayOptions());
  handle(CH.replaySetOptions, (_event, options: { applyDelay: boolean; passthrough: boolean }) =>
    context.setReplayOptions(options),
  );

  // 인터셉션 (#4 오버라이드 / #7 throttle / #3 브레이크포인트)
  handle(CH.overrideList, () => context.getOverrideRules());
  handle(CH.overrideSet, (_event, rules: OverrideRule[]) => context.setOverrideRules(rules));
  handle(CH.throttleGet, () => context.getThrottle());
  handle(CH.throttleSet, (_event, config: ThrottleConfig) => context.setThrottle(config));
  handle(CH.breakpointPatternsGet, () => context.getBreakpointPatterns());
  handle(CH.breakpointPatternsSet, (_event, patterns: string[]) => context.setBreakpointPatterns(patterns));
  handle(CH.breakpointResolve, (_event, id: number, action: 'forward' | 'block') => {
    context.resolveBreakpoint(id, action);
    return { resolved: true };
  });

  // 조건부 알림 (#30)
  handle(CH.alertGet, () => context.getAlertRule());
  handle(CH.alertSet, (_event, rule: { enabled: boolean; statusMin: number }) => context.setAlertRule(rule));

  // 모바일 페어링 QR (#31)
  handle(CH.pairingQr, () => buildPairingQr(context.getProxyStatus().port ?? 8888));
};
