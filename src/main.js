import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import path from 'node:path';
import { GameLauncher, createOfflineProfile } from './main/launcher.js';
import { getMinecraftDir, ensureDir, initMinecraftDir } from './main/utils.js';
import { UserManager } from './main/userManager.js';
import { loadSettings, saveSettings, getMinecraftDirFromSettings } from './main/settings.js';
import { javaManager } from './main/javaManager.js';
import { loadFileCacheIndex, cancel, onProgress, onFileStart, onFileEnd, onRetry, onDownloadProgress, onComplete, getVersionJson, getFabricData, setFabricData, setLauncherType, buildFabricVersionJson } from './main/downloaders/index.js';
import { checkFullyInstalled, markFullyInstalled } from './main/installStatus.js';

import { getCurrentPack, installWithAdapt, getBaseVersion } from './main/adapt.js';

Menu.setApplicationMenu(null);

let mainWindow = null;
let launcher = null;
let userManager = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 520,
    resizable: false,
    frame: false,
    title: 'FastLauncher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  app.setName('FastLauncher');

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

async function startDownload(username, version) {
  console.log('startDownload called with username:', username, 'version:', version);
  try {
    sendToRenderer('state-change', { state: 'checking', message: '检查版本信息...' });
    
    await ensureDir(getMinecraftDir());
    
    await loadFileCacheIndex();
    
    onFileStart(({ workerId, id, path }) => {
      sendToRenderer('file-start', { workerId, id, path });
    });
    
    onFileEnd(({ workerId, id, path }) => {
      sendToRenderer('file-end', { workerId, id, path });
    });
    
    onRetry(({ id, path, attempt, error, delay }) => {
      sendToRenderer('download-retry', { id, path, attempt, error, delay });
    });
    
    onProgress((status) => {
      sendToRenderer('download-progress', status);
    });
    
    onDownloadProgress(({ id, path, downloaded, total, speed }) => {
      sendToRenderer('file-progress', { id, path, downloaded, total, speed });
    });
    
    onComplete(() => {
      sendToRenderer('state-change', { state: 'downloaded', message: '下载完成' });
    });

    const packStatus = await checkFullyInstalled();
    const alreadyInstalled = packStatus.fullyInstalled === true;

    if (!alreadyInstalled) {
      sendToRenderer('state-change', { state: 'downloading', message: '正在下载...' });
      await installWithAdapt(getCurrentPack(), sendToRenderer);
      
      await markFullyInstalled({
        mcVersion: getBaseVersion(),
        fabricEnabled: !!getFabricData(),
        fabricData: getFabricData()
      });
    }

    sendToRenderer('state-change', { state: 'downloaded', message: '使用已安装版本' });

    const launchStatus = await checkFullyInstalled();
    const mcVersion = launchStatus.mcVersion;
    
    if (launchStatus.fabricData) {
      setFabricData(launchStatus.fabricData);
      setLauncherType('fabric');
    }
    
    sendToRenderer('state-change', { state: 'extracting', message: '正在解压 natives...' });
    
    const versionJson = await getVersionJson(mcVersion);
    const fabricDataForLauncher = getFabricData();
    const finalVersionJson = fabricDataForLauncher ? buildFabricVersionJson(fabricDataForLauncher, versionJson) : versionJson;
    
    launcher = new GameLauncher(finalVersionJson, fabricDataForLauncher);
    
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

    launcher.on('game-started', () => {
      console.log('[MAIN] Game started, quitting launcher');
      app.quit();
    });

    launchGame(username);
    
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

app.whenReady().then(async () => {
  await loadSettings();
  initMinecraftDir(getMinecraftDirFromSettings());
  
  userManager = new UserManager();
  await userManager.load();
  
  createWindow();

  ipcMain.handle('start-download', async (event, { username }) => {
    try {
      await startDownload(username, getCurrentPack().id);
      return { success: true };
    } catch (error) {
      console.error('[START-DOWNLOAD] Error:', error.message);
      console.error('[START-DOWNLOAD] Stack:', error.stack);
      sendToRenderer('state-change', { state: 'error', message: error.message });
      sendToRenderer('launcher-error', { error: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('launch-game', async (event, { username }) => {
    await launchGame(username);
    return { success: true };
  });

  ipcMain.handle('cancel-download', async () => {
    await cancel();
    return { success: true };
  });

  ipcMain.handle('get-minecraft-dir', () => {
    return getMinecraftDir();
  });

  ipcMain.handle('get-settings', async () => {
    return await loadSettings();
  });

  ipcMain.handle('save-settings', async (event, { minecraftDir }) => {
    try {
      const settings = await saveSettings({ minecraftDir, firstLaunch: false });
      initMinecraftDir(minecraftDir);
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 Minecraft 游戏目录'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window-hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.destroy();
      app.quit();
    }
  });

  ipcMain.handle('get-profiles', () => {
    return {
      profiles: userManager.getProfiles(),
      lastUsedUsername: userManager.getLastUsedUsername()
    };
  });

  ipcMain.handle('create-profile', async (event, { username }) => {
    const profile = await userManager.createProfile(username);
    return { success: true, profile };
  });

  ipcMain.handle('delete-profile', async (event, { profileId }) => {
    const success = await userManager.deleteProfile(profileId);
    return { success };
  });

  ipcMain.handle('rename-profile', async (event, { profileId, newUsername }) => {
    const profile = await userManager.renameProfile(profileId, newUsername);
    return { success: true, profile };
  });

  ipcMain.handle('select-profile', async (event, { username }) => {
    const profile = await userManager.selectProfile(username);
    return { success: true, profile };
  });

  ipcMain.handle('check-java', async () => {
    try {
      const info = await javaManager.getJavaInfo();
      return { success: true, ...info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-java', async (event, { version }) => {
    try {
      const javaPath = await javaManager.downloadAndInstallJava(version || 17);
      return { success: true, javaPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  javaManager.on('download-start', ({ version }) => {
    sendToRenderer('java-download-start', { version });
  });

  javaManager.on('download-progress', ({ downloaded, total, progress, method }) => {
    sendToRenderer('java-download-progress', { downloaded, total, progress, method });
  });

  javaManager.on('download-stage', ({ stage, progress }) => {
    sendToRenderer('java-download-stage', { stage, progress });
  });

  javaManager.on('download-retry', ({ attempt, maxRetries, error }) => {
    sendToRenderer('java-download-retry', { attempt, maxRetries, error });
  });

  javaManager.on('download-complete', ({ version, javaPath }) => {
    sendToRenderer('java-download-complete', { version, javaPath });
  });

  javaManager.on('download-error', ({ error }) => {
    sendToRenderer('java-download-error', { error });
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
