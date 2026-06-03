import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AppContext } from './appContext';
import { registerIpcHandlers } from './ipcHandlers';

/**
 * #10 자동 업데이트: 패키징된 앱에서만 electron-updater로 업데이트를 확인한다.
 * 실제 동작하려면 electron-builder.yml의 publish(예: GitHub Releases)와 서명/릴리스가 필요하다.
 * 개발 모드·publish 미설정 시 조용히 무시한다.
 */
const checkForUpdates = async (): Promise<void> => {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = await import('electron-updater');
    await autoUpdater.checkForUpdatesAndNotify();
  } catch {
    // 릴리스 피드 미설정 등 — 무시 (업데이트는 선택 기능)
  }
};

let mainWindow: BrowserWindow | null = null;
let appContext: AppContext | null = null;
let quitting = false;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'HttpProxyRecord',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// #28 헤드리스 CLI 모드: `electron . --headless [--port 8888]` — UI 없이 프록시만 기동
const headless = process.argv.includes('--headless');
const headlessPort = (() => {
  const index = process.argv.indexOf('--port');
  return index >= 0 ? Number(process.argv[index + 1]) : 8888;
})();

const runHeadless = async (): Promise<void> => {
  appContext = new AppContext();
  appContext.setBroadcaster((record) => {
    process.stdout.write(`${record.method} ${record.statusCode} ${record.url}\n`);
  });
  const status = await appContext.startRecording(`CLI ${new Date().toISOString()}`, headlessPort);
  process.stdout.write(`HttpProxyRecord 헤드리스 프록시 실행: 127.0.0.1:${status.port}\n`);
  process.stdout.write('종료하려면 Ctrl+C\n');
};

void app.whenReady().then(() => {
  if (headless) {
    void runHeadless();
    return;
  }

  appContext = new AppContext();
  registerIpcHandlers(appContext, () => mainWindow);
  createWindow();
  void checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 종료 시 시스템 프록시 해제/프록시 중지/DB 정리 후 종료 (인터넷 끊김 사고 방지)
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;

  void (async () => {
    try {
      await appContext?.dispose();
    } finally {
      app.exit(0);
    }
  })();
});
