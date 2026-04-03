import { contextBridge, ipcRenderer } from 'electron';

const api = {
  startDownload: (username) => ipcRenderer.invoke('start-download', { username }),
  launchGame: (username) => ipcRenderer.invoke('launch-game', { username }),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getMinecraftDir: () => ipcRenderer.invoke('get-minecraft-dir'),
  getDefaultMinecraftDir: () => ipcRenderer.invoke('get-default-minecraft-dir'),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getCurrentPack: () => ipcRenderer.invoke('get-current-pack'),
  saveSettings: (minecraftDir) => ipcRenderer.invoke('save-settings', { minecraftDir }),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  checkJavaStatus: () => ipcRenderer.invoke('check-java'),
  downloadJava: (version) => ipcRenderer.invoke('download-java', { version }),
  
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (username) => ipcRenderer.invoke('create-profile', { username }),
  deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', { profileId }),
  renameProfile: (profileId, newUsername) => ipcRenderer.invoke('rename-profile', { profileId, newUsername }),
  selectProfile: (username) => ipcRenderer.invoke('select-profile', { username }),

  getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions'),
  getVersionDetails: (versionId) => ipcRenderer.invoke('get-version-details', { versionId }),

  onStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },
  
  onVersionInfo: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('version-info', handler);
    return () => ipcRenderer.removeListener('version-info', handler);
  },
  
  onDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  
  onFileStart: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('file-start', handler);
    return () => ipcRenderer.removeListener('file-start', handler);
  },
  
  onFileEnd: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('file-end', handler);
    return () => ipcRenderer.removeListener('file-end', handler);
  },
  
  onFileProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('file-progress', handler);
    return () => ipcRenderer.removeListener('file-progress', handler);
  },
  
  onDownloadRetry: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-retry', handler);
    return () => ipcRenderer.removeListener('download-retry', handler);
  },
  
  onLauncherError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('launcher-error', handler);
    return () => ipcRenderer.removeListener('launcher-error', handler);
  },
  
  onCompletenessChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('completeness-change', handler);
    return () => ipcRenderer.removeListener('completeness-change', handler);
  },
  
  onJavaDownloadStart: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-start', handler);
    return () => ipcRenderer.removeListener('java-download-start', handler);
  },
  
  onJavaDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-progress', handler);
    return () => ipcRenderer.removeListener('java-download-progress', handler);
  },
  
  onJavaDownloadStage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-stage', handler);
    return () => ipcRenderer.removeListener('java-download-stage', handler);
  },
  
  onJavaDownloadRetry: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-retry', handler);
    return () => ipcRenderer.removeListener('java-download-retry', handler);
  },
  
  onJavaDownloadComplete: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-complete', handler);
    return () => ipcRenderer.removeListener('java-download-complete', handler);
  },
  
  onJavaDownloadError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('java-download-error', handler);
    return () => ipcRenderer.removeListener('java-download-error', handler);
  },
};

const controlAPI = {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  hide: () => ipcRenderer.invoke('window-hide'),
};

contextBridge.exposeInMainWorld('launcherAPI', api);
contextBridge.exposeInMainWorld('controlAPI', controlAPI);
