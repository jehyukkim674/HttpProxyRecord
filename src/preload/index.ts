import { contextBridge, ipcRenderer } from 'electron';
import { CH, EV } from '../shared/channels';
import type {
  ComposedRequest,
  ComposedResponse,
  Favorite,
  InterceptScript,
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
    ipcRenderer.invoke(CH.proxyStartRecording, sessionName, port),
  stopRecording: (): Promise<ProxyStatus> => ipcRenderer.invoke(CH.proxyStopRecording),
  getProxyStatus: (): Promise<ProxyStatus> => ipcRenderer.invoke(CH.proxyStatus),

  // 실시간 트래픽 구독
  onTraffic: (callback: (record: TrafficRecord) => void): (() => void) => {
    const listener = (_event: unknown, record: TrafficRecord): void => callback(record);
    ipcRenderer.on(EV.traffic, listener);
    return () => {
      ipcRenderer.removeListener(EV.traffic, listener);
    };
  },

  // 세션
  listSessions: (): Promise<Session[]> => ipcRenderer.invoke(CH.sessionList),
  deleteSession: (sessionId: number): Promise<Session[]> => ipcRenderer.invoke(CH.sessionDelete, sessionId),
  getSessionTraffic: (sessionId: number): Promise<TrafficRecord[]> =>
    ipcRenderer.invoke(CH.sessionTraffic, sessionId),

  // 설정: 캡처 제외 도메인
  getExcludeDomains: (): Promise<string[]> => ipcRenderer.invoke(CH.settingsGetExcludeDomains),
  setExcludeDomains: (domains: string[]): Promise<string[]> =>
    ipcRenderer.invoke(CH.settingsSetExcludeDomains, domains),

  // 시스템 프록시 / 인증서
  enableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(CH.systemProxyEnable),
  disableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(CH.systemProxyDisable),
  getSystemProxyStatus: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(CH.systemProxyStatus),
  installCert: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(CH.certInstall),

  // 재생
  startReplay: (sessionId: number, port: number): Promise<ReplayStatus> =>
    ipcRenderer.invoke(CH.replayStart, sessionId, port),
  stopReplay: (): Promise<ReplayStatus> => ipcRenderer.invoke(CH.replayStop),
  getReplayStatus: (): Promise<ReplayStatus> => ipcRenderer.invoke(CH.replayStatus),

  // 내보내기
  exportHar: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportHar, sessionId),
  exportMarkdown: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportMarkdown, sessionId),
  copyCurl: (recordId: number): Promise<{ copied: boolean }> => ipcRenderer.invoke(CH.exportCurl, recordId),

  // Composer (재전송/체이닝)
  composerSend: (request: ComposedRequest): Promise<ComposedResponse> =>
    ipcRenderer.invoke(CH.composerSend, request),

  // 스냅샷 (#26)
  saveSnapshot: (record: TrafficRecord): Promise<Snapshot> => ipcRenderer.invoke(CH.snapshotSave, record),
  listSnapshots: (): Promise<Snapshot[]> => ipcRenderer.invoke(CH.snapshotList),
  deleteSnapshot: (id: number): Promise<Snapshot[]> => ipcRenderer.invoke(CH.snapshotDelete, id),
  verifySnapshot: (id: number): Promise<SnapshotVerifyResult> => ipcRenderer.invoke(CH.snapshotVerify, id),

  // 내보내기/가져오기 확장 (Phase 5)
  copyToClipboard: (text: string): Promise<{ copied: boolean }> =>
    ipcRenderer.invoke(CH.clipboardWrite, text),
  exportPostman: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportPostman, sessionId),
  exportOpenApi: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportOpenApi, sessionId),
  importHar: (): Promise<{ imported: boolean; sessions?: Session[] }> => ipcRenderer.invoke(CH.importHar),
  exportBundle: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportBundle, sessionId),
  importBundle: (): Promise<{ imported: boolean; sessions?: Session[] }> =>
    ipcRenderer.invoke(CH.importBundle),

  // 인터셉션 (#4 #7)
  listOverrideRules: (): Promise<OverrideRule[]> => ipcRenderer.invoke(CH.overrideList),
  setOverrideRules: (rules: OverrideRule[]): Promise<OverrideRule[]> =>
    ipcRenderer.invoke(CH.overrideSet, rules),
  getThrottle: (): Promise<ThrottleConfig> => ipcRenderer.invoke(CH.throttleGet),
  setThrottle: (config: ThrottleConfig): Promise<ThrottleConfig> =>
    ipcRenderer.invoke(CH.throttleSet, config),

  // 브레이크포인트 (#3)
  getBreakpointPatterns: (): Promise<string[]> => ipcRenderer.invoke(CH.breakpointPatternsGet),
  setBreakpointPatterns: (patterns: string[]): Promise<string[]> =>
    ipcRenderer.invoke(CH.breakpointPatternsSet, patterns),
  resolveBreakpoint: (id: number, action: 'forward' | 'block'): Promise<{ resolved: boolean }> =>
    ipcRenderer.invoke(CH.breakpointResolve, id, action),
  onBreakpoint: (callback: (hit: { id: number; method: string; url: string }) => void): (() => void) => {
    const listener = (_event: unknown, hit: { id: number; method: string; url: string }): void =>
      callback(hit);
    ipcRenderer.on(EV.breakpointHit, listener);
    return () => {
      ipcRenderer.removeListener(EV.breakpointHit, listener);
    };
  },

  // 재생 옵션 (#16 #17)
  getReplayOptions: (): Promise<ReplayOptions> => ipcRenderer.invoke(CH.replayGetOptions),
  setReplayOptions: (options: ReplayOptions): Promise<ReplayOptions> =>
    ipcRenderer.invoke(CH.replaySetOptions, options),

  // 즐겨찾기 (#19)
  saveFavorite: (input: { method: string; url: string; note: string }): Promise<Favorite> =>
    ipcRenderer.invoke(CH.favoriteSave, input),
  listFavorites: (): Promise<Favorite[]> => ipcRenderer.invoke(CH.favoriteList),
  updateFavoriteNote: (id: number, note: string): Promise<Favorite[]> =>
    ipcRenderer.invoke(CH.favoriteUpdateNote, id, note),
  deleteFavorite: (id: number): Promise<Favorite[]> => ipcRenderer.invoke(CH.favoriteDelete, id),

  // 내보내기 확장 (#29) / 알림 (#30) / 모바일 QR (#31)
  exportK6: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(CH.exportK6, sessionId),
  getAlertRule: (): Promise<{ enabled: boolean; statusMin: number }> => ipcRenderer.invoke(CH.alertGet),
  setAlertRule: (rule: {
    enabled: boolean;
    statusMin: number;
  }): Promise<{ enabled: boolean; statusMin: number }> => ipcRenderer.invoke(CH.alertSet, rule),
  getPairingQr: (): Promise<{ ip: string | null; port: number; dataUrl: string | null; guide: string }> =>
    ipcRenderer.invoke(CH.pairingQr),

  // AI (#21~#24)
  getAiKeyStatus: (): Promise<{ hasKey: boolean }> => ipcRenderer.invoke(CH.aiKeyStatus),
  setAiApiKey: (apiKey: string): Promise<{ hasKey: boolean }> => ipcRenderer.invoke(CH.aiSetKey, apiKey),
  aiExplain: (recordId: number): Promise<string> => ipcRenderer.invoke(CH.aiExplain, recordId),
  aiGenerateTests: (recordId: number): Promise<string> => ipcRenderer.invoke(CH.aiGenerateTests, recordId),
  aiDetectAnomalies: (sessionId: number): Promise<string> =>
    ipcRenderer.invoke(CH.aiDetectAnomalies, sessionId),
  aiSearch: (sessionId: number, query: string): Promise<number[]> =>
    ipcRenderer.invoke(CH.aiSearch, sessionId, query),
  aiSessionReport: (sessionId: number): Promise<string> => ipcRenderer.invoke(CH.aiSessionReport, sessionId),
  aiSecuritySuggest: (recordId: number): Promise<string> =>
    ipcRenderer.invoke(CH.aiSecuritySuggest, recordId),

  // 스크립트 인터셉션
  listScripts: (): Promise<InterceptScript[]> => ipcRenderer.invoke(CH.scriptList),
  saveScript: (input: {
    id?: string;
    name: string;
    code: string;
    enabled: boolean;
  }): Promise<InterceptScript[]> => ipcRenderer.invoke(CH.scriptSave, input),
  deleteScript: (id: string): Promise<InterceptScript[]> => ipcRenderer.invoke(CH.scriptDelete, id),
  toggleScript: (id: string, enabled: boolean): Promise<InterceptScript[]> =>
    ipcRenderer.invoke(CH.scriptToggle, id, enabled),
  onScriptLog: (
    callback: (entry: { scriptId: string; level: string; message: string }) => void,
  ): (() => void) => {
    const listener = (_event: unknown, entry: { scriptId: string; level: string; message: string }): void =>
      callback(entry);
    ipcRenderer.on(EV.scriptLog, listener);
    return () => {
      ipcRenderer.removeListener(EV.scriptLog, listener);
    };
  },
};

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
