import type { AppContext } from '../appContext';
import { installRootCa } from '../system/certInstaller';
import { CH } from '../../shared/channels';
import { handle } from './handle';

/** 녹화/프록시 제어, 세션, 캡처 제외 도메인, 시스템 프록시, 인증서. */
export const registerRecordingHandlers = (context: AppContext): void => {
  // 프록시/녹화
  handle(CH.proxyStartRecording, (_event, sessionName: string, port: number) =>
    context.startRecording(sessionName, port),
  );
  handle(CH.proxyStopRecording, () => context.stopRecording());
  handle(CH.proxyStatus, () => context.getProxyStatus());

  // 세션
  handle(CH.sessionList, () => context.recordStore.listSessions());
  handle(CH.sessionDelete, (_event, sessionId: number) => {
    context.recordStore.deleteSession(sessionId);
    return context.recordStore.listSessions();
  });
  handle(CH.sessionTraffic, (_event, sessionId: number) => context.recordStore.listTraffic(sessionId));

  // 설정: 캡처 제외 도메인
  handle(CH.settingsGetExcludeDomains, () => context.getExcludeDomains());
  handle(CH.settingsSetExcludeDomains, (_event, domains: string[]) => context.setExcludeDomains(domains));

  // 시스템 프록시 / 인증서
  handle(CH.systemProxyEnable, async () => {
    const status = context.getProxyStatus();
    if (!status.running || status.port === null) {
      throw new Error('프록시가 실행 중이 아니에요. 먼저 녹화를 시작해 주세요.');
    }
    await context.systemProxyManager.enable('127.0.0.1', status.port);
    return { enabled: true };
  });
  handle(CH.systemProxyDisable, async () => {
    await context.systemProxyManager.disable();
    return { enabled: false };
  });
  handle(CH.systemProxyStatus, () => ({ enabled: context.systemProxyManager.isEnabled }));
  handle(CH.certInstall, () => installRootCa(context.certManager.rootCaCertPath));
};
