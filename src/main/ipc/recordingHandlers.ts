import type { AppContext } from '../appContext';
import { installRootCa } from '../system/certInstaller';
import { handle } from './handle';

/** 녹화/프록시 제어, 세션, 캡처 제외 도메인, 시스템 프록시, 인증서. */
export const registerRecordingHandlers = (context: AppContext): void => {
  // 프록시/녹화
  handle('proxy:start-recording', (_event, sessionName: string, port: number) =>
    context.startRecording(sessionName, port),
  );
  handle('proxy:stop-recording', () => context.stopRecording());
  handle('proxy:status', () => context.getProxyStatus());

  // 세션
  handle('session:list', () => context.recordStore.listSessions());
  handle('session:delete', (_event, sessionId: number) => {
    context.recordStore.deleteSession(sessionId);
    return context.recordStore.listSessions();
  });
  handle('session:traffic', (_event, sessionId: number) => context.recordStore.listTraffic(sessionId));

  // 설정: 캡처 제외 도메인
  handle('settings:get-exclude-domains', () => context.getExcludeDomains());
  handle('settings:set-exclude-domains', (_event, domains: string[]) => context.setExcludeDomains(domains));

  // 시스템 프록시 / 인증서
  handle('system-proxy:enable', async () => {
    const status = context.getProxyStatus();
    if (!status.running || status.port === null) {
      throw new Error('프록시가 실행 중이 아니에요. 먼저 녹화를 시작해 주세요.');
    }
    await context.systemProxyManager.enable('127.0.0.1', status.port);
    return { enabled: true };
  });
  handle('system-proxy:disable', async () => {
    await context.systemProxyManager.disable();
    return { enabled: false };
  });
  handle('system-proxy:status', () => ({ enabled: context.systemProxyManager.isEnabled }));
  handle('cert:install', () => installRootCa(context.certManager.rootCaCertPath));
};
