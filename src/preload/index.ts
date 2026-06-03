import { contextBridge, ipcRenderer } from 'electron';
import type {
  ComposedRequest,
  ComposedResponse,
  ProxyStatus,
  ReplayStatus,
  Session,
  TrafficRecord,
} from '../shared/types';

const api = {
  // 프록시/녹화
  startRecording: (sessionName: string, port: number): Promise<ProxyStatus> =>
    ipcRenderer.invoke('proxy:start-recording', sessionName, port),
  stopRecording: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:stop-recording'),
  getProxyStatus: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:status'),

  // 실시간 트래픽 구독
  onTraffic: (callback: (record: TrafficRecord) => void): (() => void) => {
    const listener = (_event: unknown, record: TrafficRecord): void => callback(record);
    ipcRenderer.on('traffic:new', listener);
    return () => {
      ipcRenderer.removeListener('traffic:new', listener);
    };
  },

  // 세션
  listSessions: (): Promise<Session[]> => ipcRenderer.invoke('session:list'),
  deleteSession: (sessionId: number): Promise<Session[]> => ipcRenderer.invoke('session:delete', sessionId),
  getSessionTraffic: (sessionId: number): Promise<TrafficRecord[]> =>
    ipcRenderer.invoke('session:traffic', sessionId),

  // 설정: 캡처 제외 도메인
  getExcludeDomains: (): Promise<string[]> => ipcRenderer.invoke('settings:get-exclude-domains'),
  setExcludeDomains: (domains: string[]): Promise<string[]> =>
    ipcRenderer.invoke('settings:set-exclude-domains', domains),

  // 시스템 프록시 / 인증서
  enableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:enable'),
  disableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:disable'),
  getSystemProxyStatus: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:status'),
  installCert: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('cert:install'),

  // 재생
  startReplay: (sessionId: number, port: number): Promise<ReplayStatus> =>
    ipcRenderer.invoke('replay:start', sessionId, port),
  stopReplay: (): Promise<ReplayStatus> => ipcRenderer.invoke('replay:stop'),
  getReplayStatus: (): Promise<ReplayStatus> => ipcRenderer.invoke('replay:status'),

  // 내보내기
  exportHar: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:har', sessionId),
  exportMarkdown: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:markdown', sessionId),
  copyCurl: (recordId: number): Promise<{ copied: boolean }> => ipcRenderer.invoke('export:curl', recordId),

  // Composer (재전송/체이닝)
  composerSend: (request: ComposedRequest): Promise<ComposedResponse> =>
    ipcRenderer.invoke('composer:send', request),
};

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
