import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AppContext } from './appContext';
import { registerIpcHandlers } from './ipcHandlers';
import { initLogger, log } from './logger';

// 로그를 userData/logs/main.log + 콘솔에 기록 (app.getPath는 ready 전에도 사용 가능)
initLogger(path.join(app.getPath('userData'), 'logs'));

// 전역 크래시 가드 — 예기치 못한 에러로 프로세스가 죽지 않도록 로깅만 하고 유지
process.on('uncaughtException', (error) => {
  log.error('uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', reason);
});

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
  } catch (error) {
    // 릴리스 피드 미설정 등 — 치명적이지 않음. 디버깅 위해 기록만.
    log.info('자동 업데이트 확인 생략', error instanceof Error ? error.message : error);
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
