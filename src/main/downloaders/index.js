import { download as vanillaDownload, getVersionInfo, getVersionJson } from './vanilla.js';
import { download as fabricDownload, buildFabricVersionJson, getFabricData, setFabricData } from './fabric.js';
import { awaitProcess, getManager, addItem, loadFileCacheIndex, cancel, onProgress, onFileStart, onFileEnd, onRetry, onDownloadProgress, onComplete } from './queue.js';

/**
 * Tracks which launcher type is active: 'vanilla' or 'fabric'.
 * Determines which classpath and version JSON logic to use at launch time.
 */
let _launcherType = 'vanilla';

export function getLauncherType() {
  return _launcherType;
}

export function resetLauncherType() {
  _launcherType = 'vanilla';
}

export function setLauncherType(type) {
  _launcherType = type;
}

export const vanilla = { download: vanillaDownload };
export const fabric = { download: fabricDownload };
export {
  getVersionInfo,
  getVersionJson,
  buildFabricVersionJson,
  getFabricData,
  setFabricData,
  awaitProcess,
  getManager,
  addItem,
  loadFileCacheIndex,
  cancel,
  onProgress,
  onFileStart,
  onFileEnd,
  onRetry,
  onDownloadProgress,
  onComplete
};
