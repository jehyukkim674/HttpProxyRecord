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

// 자동 업데이트 확인은 렌더러가 시작 시 ipc.checkUpdate()로 수행하고 앱 내 배너로 안내한다
// (UpdateManager: src/main/system/updater.ts, updateHandlers). 네이티브 알림 대신 인앱 UX.

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
