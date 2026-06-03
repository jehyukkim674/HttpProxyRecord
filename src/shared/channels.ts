/**
 * IPC 채널명 단일 소스.
 *
 * main(`handle(...)`)과 preload(`ipcRenderer.invoke(...)`)가 같은 상수를 참조하므로
 * 양쪽 문자열이 어긋날 일이 없다. 채널을 추가/변경할 때는 이 파일 한 곳만 고치면 된다.
 *
 * 그룹은 `src/main/ipc/*Handlers.ts` 모듈 구성과 1:1로 맞춰, 채널이 어디서 처리되는지
 * 바로 찾을 수 있게 했다.
 */
export const CH = {
  // recordingHandlers — 프록시/녹화, 세션, 캡처 제외 도메인, 시스템 프록시, 인증서
  proxyStartRecording: 'proxy:start-recording',
  proxyStopRecording: 'proxy:stop-recording',
  proxyStatus: 'proxy:status',
  sessionList: 'session:list',
  sessionDelete: 'session:delete',
  sessionTraffic: 'session:traffic',
  settingsGetExcludeDomains: 'settings:get-exclude-domains',
  settingsSetExcludeDomains: 'settings:set-exclude-domains',
  systemProxyEnable: 'system-proxy:enable',
  systemProxyDisable: 'system-proxy:disable',
  systemProxyStatus: 'system-proxy:status',
  certInstall: 'cert:install',

  // replayInterceptionHandlers — 재생, 오버라이드, throttle, 브레이크포인트, 알림, 모바일 QR
  replayStart: 'replay:start',
  replayStop: 'replay:stop',
  replayStatus: 'replay:status',
  replayGetOptions: 'replay:get-options',
  replaySetOptions: 'replay:set-options',
  overrideList: 'override:list',
  overrideSet: 'override:set',
  throttleGet: 'throttle:get',
  throttleSet: 'throttle:set',
  breakpointPatternsGet: 'breakpoint:patterns:get',
  breakpointPatternsSet: 'breakpoint:patterns:set',
  breakpointResolve: 'breakpoint:resolve',
  alertGet: 'alert:get',
  alertSet: 'alert:set',
  pairingQr: 'pairing:qr',

  // exportHandlers — 내보내기/가져오기/클립보드
  exportHar: 'export:har',
  exportMarkdown: 'export:markdown',
  exportPostman: 'export:postman',
  exportOpenApi: 'export:openapi',
  exportK6: 'export:k6',
  exportCurl: 'export:curl',
  exportBundle: 'export:bundle',
  importHar: 'import:har',
  importBundle: 'import:bundle',
  clipboardWrite: 'clipboard:write',

  // composerSnapshotHandlers — Composer 재전송, 스냅샷, 즐겨찾기
  composerSend: 'composer:send',
  snapshotSave: 'snapshot:save',
  snapshotList: 'snapshot:list',
  snapshotDelete: 'snapshot:delete',
  snapshotVerify: 'snapshot:verify',
  favoriteSave: 'favorite:save',
  favoriteList: 'favorite:list',
  favoriteUpdateNote: 'favorite:update-note',
  favoriteDelete: 'favorite:delete',

  // aiHandlers — AI 설명/테스트/이상탐지/검색
  aiKeyStatus: 'ai:key-status',
  aiSetKey: 'ai:set-key',
  aiExplain: 'ai:explain',
  aiGenerateTests: 'ai:generate-tests',
  aiDetectAnomalies: 'ai:detect-anomalies',
  aiSearch: 'ai:search',
  aiSessionReport: 'ai:session-report',
  aiSecuritySuggest: 'ai:security-suggest',
  aiMockData: 'ai:mock-data',

  // scriptHandlers — 스크립트 인터셉션
  scriptList: 'script:list',
  scriptSave: 'script:save',
  scriptDelete: 'script:delete',
  scriptToggle: 'script:toggle',
} as const;

/** Main→Renderer 단방향 푸시 이벤트 (`webContents.send` / `ipcRenderer.on`) */
export const EV = {
  traffic: 'traffic:new',
  breakpointHit: 'breakpoint:hit',
  scriptLog: 'script:log',
} as const;
