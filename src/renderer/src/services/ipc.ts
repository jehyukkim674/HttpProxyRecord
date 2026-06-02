import type { ProxyStatus, ReplayStatus, Session, TrafficRecord } from '../../../shared/types';

/** preload가 노출한 window.api 래퍼 — 컴포넌트는 이 모듈만 사용한다 */
export const ipc = {
  // 프록시/녹화
  startRecording: (sessionName: string, port: number): Promise<ProxyStatus> =>
    window.api.startRecording(sessionName, port),
  stopRecording: (): Promise<ProxyStatus> => window.api.stopRecording(),
  getProxyStatus: (): Promise<ProxyStatus> => window.api.getProxyStatus(),
  onTraffic: (callback: (record: TrafficRecord) => void): (() => void) => window.api.onTraffic(callback),

  // 세션
  listSessions: (): Promise<Session[]> => window.api.listSessions(),
  deleteSession: (sessionId: number): Promise<Session[]> => window.api.deleteSession(sessionId),
  getSessionTraffic: (sessionId: number): Promise<TrafficRecord[]> => window.api.getSessionTraffic(sessionId),

  // 시스템 프록시 / 인증서
  enableSystemProxy: (): Promise<{ enabled: boolean }> => window.api.enableSystemProxy(),
  disableSystemProxy: (): Promise<{ enabled: boolean }> => window.api.disableSystemProxy(),
  getSystemProxyStatus: (): Promise<{ enabled: boolean }> => window.api.getSystemProxyStatus(),
  installCert: (): Promise<{ ok: boolean; message: string }> => window.api.installCert(),

  // 재생
  startReplay: (sessionId: number, port: number): Promise<ReplayStatus> =>
    window.api.startReplay(sessionId, port),
  stopReplay: (): Promise<ReplayStatus> => window.api.stopReplay(),
  getReplayStatus: (): Promise<ReplayStatus> => window.api.getReplayStatus(),

  // 내보내기
  exportHar: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    window.api.exportHar(sessionId),
  exportMarkdown: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    window.api.exportMarkdown(sessionId),
  copyCurl: (recordId: number): Promise<{ copied: boolean }> => window.api.copyCurl(recordId),
};
