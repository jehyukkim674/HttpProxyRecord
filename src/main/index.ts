import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AppContext } from './appContext';
import { registerIpcHandlers } from './ipcHandlers';

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

void app.whenReady().then(() => {
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
