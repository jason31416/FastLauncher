import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createVersionManager } from './main/version.js';
import { DownloadManager } from './main/downloader.js';
import { GameLauncher, createOfflineProfile } from './main/launcher.js';
import { getMinecraftDir, ensureDir } from './main/utils.js';
import fs from 'fs/promises';

if (started) {
  app.quit();
}

let mainWindow = null;
let downloadManager = null;
let versionManager = null;
let launcher = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 520,
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

async function startDownload(username) {
  console.log('startDownload called with username:', username);
  try {
    sendToRenderer('state-change', { state: 'checking', message: '检查版本信息...' });
    
    await ensureDir(getMinecraftDir());
    
    versionManager = await createVersionManager();
    
    const versionInfo = versionManager.getVersionInfo();
    sendToRenderer('version-info', versionInfo);
    
    downloadManager = new DownloadManager();
    
    downloadManager.on('file-start', ({ workerId, id, path }) => {
      sendToRenderer('file-start', { workerId, id, path });
    });
    
    downloadManager.on('retry', ({ id, path, attempt, error, delay }) => {
      sendToRenderer('download-retry', { id, path, attempt, error, delay });
    });
    
    downloadManager.on('progress', (status) => {
      sendToRenderer('download-progress', status);
    });
    
    downloadManager.on('download-progress', ({ id, path, downloaded, total, speed }) => {
      sendToRenderer('file-progress', { id, path, downloaded, total, speed });
    });
    
    downloadManager.on('complete', () => {
      sendToRenderer('state-change', { state: 'downloaded', message: '下载完成' });
    });

    const libItems = versionManager.getDownloadList();
    for (const item of libItems) {
      downloadManager.addItem(item);
    }
    
    await versionManager.fetchAssetIndex(downloadManager);
    
    const assetItems = versionManager.getAssetDownloadList();
    for (const item of assetItems) {
      downloadManager.addItem(item);
    }

    const totalItems = libItems.length + assetItems.length + 1;
    sendToRenderer('state-change', { state: 'downloading', message: `正在下载 ${totalItems} 个文件...` });
    
    await downloadManager.start();
    
    sendToRenderer('state-change', { state: 'extracting', message: '正在解压 natives...' });
    
    launcher = new GameLauncher(versionManager.versionJson);
    
    launcher.on('stdout', (log) => {
      console.log('[GAME OUTPUT]', log);
    });
    
    launcher.on('stderr', (log) => {
      console.error('[GAME ERROR]', log);
    });
    
    launcher.on('error', (err) => {
      console.error('[GAME ERROR EVENT]', err);
    });
    
    launcher.on('exit', (code) => {
      console.log('[GAME EXIT]', code);
    });
    
    const profile = createOfflineProfile(username);
    sendToRenderer('state-change', { state: 'ready', message: '准备启动', profile });
    
  } catch (error) {
    sendToRenderer('state-change', { state: 'error', message: error.message });
    sendToRenderer('launcher-error', { error: error.message, stack: error.stack });
  }
}

async function launchGame(username) {
  try {
    sendToRenderer('state-change', { state: 'launching', message: '正在启动游戏...' });
    
    const profile = createOfflineProfile(username);
    
    console.log('[MAIN] Starting game launch...');
    await launcher.launch(profile);
    console.log('[MAIN] Game launch completed');
    
    sendToRenderer('state-change', { state: 'playing', message: '游戏已启动' });
    
  } catch (error) {
    console.error('[MAIN] Game launch failed:', error);
    console.error('[MAIN] Error stack:', error.stack);
    sendToRenderer('state-change', { state: 'error', message: error.message });
    sendToRenderer('launcher-error', { error: error.message, stack: error.stack });
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('start-download', async (event, { username }) => {
    console.log('IPC start-download received, username:', username);
    try {
      await startDownload(username);
      return { success: true };
    } catch (error) {
      console.error('start-download error:', error);
      sendToRenderer('state-change', { state: 'error', message: error.message });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('launch-game', async (event, { username }) => {
    await launchGame(username);
    return { success: true };
  });

  ipcMain.handle('cancel-download', async () => {
    if (downloadManager) {
      await downloadManager.cancel();
    }
    return { success: true };
  });

  ipcMain.handle('get-minecraft-dir', () => {
    return getMinecraftDir();
  });

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.destroy();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
