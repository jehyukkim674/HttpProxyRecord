import { contextBridge, ipcRenderer } from 'electron';
import type {
  ComposedRequest,
  ComposedResponse,
  Favorite,
  OverrideRule,
  ProxyStatus,
  ReplayStatus,
  Session,
  Snapshot,
  SnapshotVerifyResult,
  ThrottleConfig,
  TrafficRecord,
} from '../shared/types';

type ReplayOptions = { applyDelay: boolean; passthrough: boolean };

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

  // 스냅샷 (#26)
  saveSnapshot: (record: TrafficRecord): Promise<Snapshot> => ipcRenderer.invoke('snapshot:save', record),
  listSnapshots: (): Promise<Snapshot[]> => ipcRenderer.invoke('snapshot:list'),
  deleteSnapshot: (id: number): Promise<Snapshot[]> => ipcRenderer.invoke('snapshot:delete', id),
  verifySnapshot: (id: number): Promise<SnapshotVerifyResult> => ipcRenderer.invoke('snapshot:verify', id),

  // 내보내기/가져오기 확장 (Phase 5)
  copyToClipboard: (text: string): Promise<{ copied: boolean }> =>
    ipcRenderer.invoke('clipboard:write', text),
  exportPostman: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:postman', sessionId),
  exportOpenApi: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:openapi', sessionId),
  importHar: (): Promise<{ imported: boolean; sessions?: Session[] }> => ipcRenderer.invoke('import:har'),

  // 인터셉션 (#4 #7)
  listOverrideRules: (): Promise<OverrideRule[]> => ipcRenderer.invoke('override:list'),
  setOverrideRules: (rules: OverrideRule[]): Promise<OverrideRule[]> =>
    ipcRenderer.invoke('override:set', rules),
  getThrottle: (): Promise<ThrottleConfig> => ipcRenderer.invoke('throttle:get'),
  setThrottle: (config: ThrottleConfig): Promise<ThrottleConfig> =>
    ipcRenderer.invoke('throttle:set', config),

  // 브레이크포인트 (#3)
  getBreakpointPatterns: (): Promise<string[]> => ipcRenderer.invoke('breakpoint:patterns:get'),
  setBreakpointPatterns: (patterns: string[]): Promise<string[]> =>
    ipcRenderer.invoke('breakpoint:patterns:set', patterns),
  resolveBreakpoint: (id: number, action: 'forward' | 'block'): Promise<{ resolved: boolean }> =>
    ipcRenderer.invoke('breakpoint:resolve', id, action),
  onBreakpoint: (callback: (hit: { id: number; method: string; url: string }) => void): (() => void) => {
    const listener = (_event: unknown, hit: { id: number; method: string; url: string }): void =>
      callback(hit);
    ipcRenderer.on('breakpoint:hit', listener);
    return () => {
      ipcRenderer.removeListener('breakpoint:hit', listener);
    };
  },

  // 재생 옵션 (#16 #17)
  getReplayOptions: (): Promise<ReplayOptions> => ipcRenderer.invoke('replay:get-options'),
  setReplayOptions: (options: ReplayOptions): Promise<ReplayOptions> =>
    ipcRenderer.invoke('replay:set-options', options),

  // 즐겨찾기 (#19)
  saveFavorite: (input: { method: string; url: string; note: string }): Promise<Favorite> =>
    ipcRenderer.invoke('favorite:save', input),
  listFavorites: (): Promise<Favorite[]> => ipcRenderer.invoke('favorite:list'),
  updateFavoriteNote: (id: number, note: string): Promise<Favorite[]> =>
    ipcRenderer.invoke('favorite:update-note', id, note),
  deleteFavorite: (id: number): Promise<Favorite[]> => ipcRenderer.invoke('favorite:delete', id),
};

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
