import { clipboard, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import type { BrowserWindow } from 'electron';
import type { AppContext } from './appContext';
import { toCurl, toHar, toMarkdown } from './export/exporter';
import { installRootCa } from './system/certInstaller';

/** 모든 IPC 채널을 등록한다. 채널 이름은 preload의 api와 1:1 대응 */
export const registerIpcHandlers = (context: AppContext, getWindow: () => BrowserWindow | null): void => {
  context.setBroadcaster((record) => {
    getWindow()?.webContents.send('traffic:new', record);
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
};
