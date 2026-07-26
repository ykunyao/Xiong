import { createMockChatProvider } from '@xiong/core';
import { createLibraryRepository, createXiongDatabase, type XiongDatabase } from '@xiong/db';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerChatIpc } from './chat-ipc';
import { createChatService } from './chat-service';
import { registerLibraryIpc } from './library-ipc';

const mainDirectory = dirname(fileURLToPath(import.meta.url));

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

function installContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [productionCsp],
      },
    });
  });
}

let database: XiongDatabase | undefined;
let mainWindow: BrowserWindow | undefined;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Xiong',
    backgroundColor: '#101419',
    webPreferences: {
      preload: join(mainDirectory, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    if (developmentUrl) {
      const expectedOrigin = new URL(developmentUrl).origin;
      if (new URL(url).origin === expectedOrigin) {
        return;
      }
    }

    if (url.startsWith('file://')) {
      return;
    }

    event.preventDefault();
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(mainDirectory, '../renderer/index.html'));
  }
}

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start Xiong.', error);
  dialog.showErrorBox('Xiong 启动失败', `无法启动应用：${message}`);
  app.quit();
}

async function startApplication(): Promise<void> {
  await app.whenReady();

  database = createXiongDatabase(join(app.getPath('userData'), 'xiong.sqlite'));
  const repository = createLibraryRepository(database);
  registerLibraryIpc(ipcMain, repository);
  registerChatIpc(ipcMain, createChatService(repository, createMockChatProvider()));

  ipcMain.handle('app:get-version', (event) => {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Rejected app:get-version from an untrusted frame.');
    }

    return app.getVersion();
  });

  if (app.isPackaged) {
    installContentSecurityPolicy();
  }

  await createWindow();

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow().catch(reportStartupFailure);
    }
  });
}

void startApplication().catch(reportStartupFailure);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  database?.close();
});
