import { contextBridge, ipcRenderer } from 'electron';

const api = {
  startDownload: (username) => ipcRenderer.invoke('start-download', { username }),
  launchGame: (username) => ipcRenderer.invoke('launch-game', { username }),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getMinecraftDir: () => ipcRenderer.invoke('get-minecraft-dir'),
  
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (username) => ipcRenderer.invoke('create-profile', { username }),
  deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', { profileId }),
  renameProfile: (profileId, newUsername) => ipcRenderer.invoke('rename-profile', { profileId, newUsername }),
  selectProfile: (username) => ipcRenderer.invoke('select-profile', { username }),
  
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
};

const controlAPI = {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
};

contextBridge.exposeInMainWorld('launcherAPI', api);
contextBridge.exposeInMainWorld('controlAPI', controlAPI);
