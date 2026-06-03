import { clipboard, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import type { BrowserWindow } from 'electron';
import type { AppContext } from './appContext';
import { toCurl, toHar, toMarkdown } from './export/exporter';
import { toOpenApi, toPostmanCollection } from './export/postmanOpenApi';
import { parseHar } from './export/harImport';
import { toK6Script } from '../shared/loadtest';
import { installRootCa } from './system/certInstaller';
import { buildPairingQr } from './system/mobilePairing';
import { sendComposedRequest } from './composer/requestSender';
import { verifySnapshot } from './composer/snapshotVerifier';
import type { ComposedRequest, OverrideRule, Session, ThrottleConfig, TrafficRecord } from '../shared/types';

/** 모든 IPC 채널을 등록한다. 채널 이름은 preload의 api와 1:1 대응 */
export const registerIpcHandlers = (context: AppContext, getWindow: () => BrowserWindow | null): void => {
  context.setBroadcaster((record) => {
    getWindow()?.webContents.send('traffic:new', record);
  });

  context.setBreakpointBroadcaster((hit) => {
    getWindow()?.webContents.send('breakpoint:hit', hit);
  });

  // ── 프록시/녹화 제어 ──
  ipcMain.handle('proxy:start-recording', async (_event, sessionName: string, port: number) => {
    return context.startRecording(sessionName, port);
  });

  ipcMain.handle('proxy:stop-recording', async () => {
    return context.stopRecording();
  });

  ipcMain.handle('proxy:status', () => {
    return context.getProxyStatus();
  });

  // ── 세션 ──
  ipcMain.handle('session:list', () => {
    return context.recordStore.listSessions();
  });

  ipcMain.handle('session:delete', (_event, sessionId: number) => {
    context.recordStore.deleteSession(sessionId);
    return context.recordStore.listSessions();
  });

  ipcMain.handle('session:traffic', (_event, sessionId: number) => {
    return context.recordStore.listTraffic(sessionId);
  });

  // ── 설정: 캡처 제외 도메인 ──
  ipcMain.handle('settings:get-exclude-domains', () => context.getExcludeDomains());

  ipcMain.handle('settings:set-exclude-domains', (_event, domains: string[]) =>
    context.setExcludeDomains(domains),
  );

  // ── 시스템 프록시 / 인증서 ──
  ipcMain.handle('system-proxy:enable', async () => {
    const status = context.getProxyStatus();
    if (!status.running || status.port === null) {
      throw new Error('프록시가 실행 중이 아니에요. 먼저 녹화를 시작해 주세요.');
    }
    await context.systemProxyManager.enable('127.0.0.1', status.port);
    return { enabled: true };
  });

  ipcMain.handle('system-proxy:disable', async () => {
    await context.systemProxyManager.disable();
    return { enabled: false };
  });

  ipcMain.handle('system-proxy:status', () => {
    return { enabled: context.systemProxyManager.isEnabled };
  });

  ipcMain.handle('cert:install', async () => {
    return installRootCa(context.certManager.rootCaCertPath);
  });

  // ── 재생 ──
  ipcMain.handle('replay:start', async (_event, sessionId: number, port: number) => {
    return context.startReplay(sessionId, port);
  });

  ipcMain.handle('replay:stop', async () => {
    return context.stopReplay();
  });

  ipcMain.handle('replay:status', () => {
    return context.getReplayStatus();
  });

  ipcMain.handle('replay:get-options', () => context.getReplayOptions());
  ipcMain.handle('replay:set-options', (_event, options: { applyDelay: boolean; passthrough: boolean }) =>
    context.setReplayOptions(options),
  );

  // ── 즐겨찾기 (#19) ──
  ipcMain.handle('favorite:save', (_event, input: { method: string; url: string; note: string }) =>
    context.recordStore.saveFavorite(input),
  );
  ipcMain.handle('favorite:list', () => context.recordStore.listFavorites());
  ipcMain.handle('favorite:update-note', (_event, id: number, note: string) => {
    context.recordStore.updateFavoriteNote(id, note);
    return context.recordStore.listFavorites();
  });
  ipcMain.handle('favorite:delete', (_event, id: number) => {
    context.recordStore.deleteFavorite(id);
    return context.recordStore.listFavorites();
  });

  // ── 내보내기 ──
  ipcMain.handle('export:har', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.har`,
      filters: [{ name: 'HAR', extensions: ['har'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    fs.writeFileSync(result.filePath, JSON.stringify(toHar(records), null, 2));
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('export:markdown', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    fs.writeFileSync(result.filePath, toMarkdown(records));
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('export:curl', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');

    const curl = toCurl(record);
    clipboard.writeText(curl);
    return { copied: true };
  });

  // 임의 텍스트 클립보드 복사 (코드 스니펫 등)
  ipcMain.handle('clipboard:write', (_event, text: string) => {
    clipboard.writeText(text);
    return { copied: true };
  });

  // Postman Collection 내보내기
  ipcMain.handle('export:postman', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const session = context.recordStore.listSessions().find((s) => s.id === sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.postman_collection.json`,
      filters: [{ name: 'Postman', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(
      result.filePath,
      JSON.stringify(toPostmanCollection(session?.name ?? '세션', records), null, 2),
    );
    return { saved: true, path: result.filePath };
  });

  // OpenAPI 스펙 내보내기 (swagger-man 연동)
  ipcMain.handle('export:openapi', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.openapi.json`,
      filters: [{ name: 'OpenAPI', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, JSON.stringify(toOpenApi(records), null, 2));
    return { saved: true, path: result.filePath };
  });

  // k6 부하테스트 스크립트 내보내기 (#29)
  ipcMain.handle('export:k6', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.k6.js`,
      filters: [{ name: 'k6', extensions: ['js'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, toK6Script(records));
    return { saved: true, path: result.filePath };
  });

  // HAR 가져오기 → 새 세션 생성
  ipcMain.handle('import:har', async (): Promise<{ imported: boolean; sessions?: Session[] }> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'HAR', extensions: ['har', 'json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { imported: false };

    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    const traffic = parseHar(raw);
    const fileName = result.filePaths[0].split('/').pop() ?? 'imported.har';
    const session = context.recordStore.createSession(`가져옴: ${fileName}`);
    for (const item of traffic) {
      context.recordStore.insertTraffic(session.id, item);
    }
    return { imported: true, sessions: context.recordStore.listSessions() };
  });

  // ── 인터셉션 (#4 오버라이드 / #7 throttle) ──
  ipcMain.handle('override:list', () => context.getOverrideRules());
  ipcMain.handle('override:set', (_event, rules: OverrideRule[]) => context.setOverrideRules(rules));
  ipcMain.handle('throttle:get', () => context.getThrottle());
  ipcMain.handle('throttle:set', (_event, config: ThrottleConfig) => context.setThrottle(config));
  ipcMain.handle('breakpoint:patterns:get', () => context.getBreakpointPatterns());
  ipcMain.handle('breakpoint:patterns:set', (_event, patterns: string[]) =>
    context.setBreakpointPatterns(patterns),
  );
  ipcMain.handle('breakpoint:resolve', (_event, id: number, action: 'forward' | 'block') => {
    context.resolveBreakpoint(id, action);
    return { resolved: true };
  });

  // ── 조건부 알림 (#30) ──
  ipcMain.handle('alert:get', () => context.getAlertRule());
  ipcMain.handle('alert:set', (_event, rule: { enabled: boolean; statusMin: number }) =>
    context.setAlertRule(rule),
  );

  // ── 모바일 페어링 QR (#31) ──
  ipcMain.handle('pairing:qr', () => {
    const status = context.getProxyStatus();
    return buildPairingQr(status.port ?? 8888);
  });

  // ── AI (#21~#24) ──
  ipcMain.handle('ai:key-status', () => context.getAiKeyStatus());
  ipcMain.handle('ai:set-key', (_event, apiKey: string) => context.setAiApiKey(apiKey));
  ipcMain.handle('ai:explain', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.explainResponse(record);
  });
  ipcMain.handle('ai:generate-tests', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.generateTests(record);
  });
  ipcMain.handle('ai:detect-anomalies', (_event, sessionId: number) =>
    context.aiService.detectAnomalies(context.recordStore.listTraffic(sessionId)),
  );
  ipcMain.handle('ai:search', (_event, sessionId: number, query: string) =>
    context.aiService.naturalLanguageSearch(query, context.recordStore.listTraffic(sessionId)),
  );

  // ── Composer (재전송/체이닝) ──
  ipcMain.handle('composer:send', (_event, request: ComposedRequest) => sendComposedRequest(request));

  // ── 스냅샷 (#26) ──
  ipcMain.handle('snapshot:save', (_event, record: TrafficRecord) =>
    context.recordStore.saveSnapshot({
      method: record.method,
      path: record.path,
      url: record.url,
      statusCode: record.statusCode,
      body: record.responseBody ?? '',
    }),
  );
  ipcMain.handle('snapshot:list', () => context.recordStore.listSnapshots());
  ipcMain.handle('snapshot:delete', (_event, id: number) => {
    context.recordStore.deleteSnapshot(id);
    return context.recordStore.listSnapshots();
  });
  ipcMain.handle('snapshot:verify', (_event, id: number) => {
    const snapshot = context.recordStore.getSnapshotById(id);
    if (!snapshot) throw new Error('스냅샷을 찾을 수 없어요.');
    return verifySnapshot(snapshot);
  });
};
