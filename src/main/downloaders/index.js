import { download as vanillaDownload, getVersionInfo, getVersionJson } from './vanilla.js';
import { download as fabricDownload, buildFabricVersionJson, getFabricData, setFabricData } from './fabric.js';
import { awaitProcess, getManager, addItem, loadAssetCacheIndex, cancel, onProgress, onFileStart, onFileEnd, onRetry, onDownloadProgress, onComplete } from './queue.js';

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
export { getVersionInfo, getVersionJson, buildFabricVersionJson, getFabricData, setFabricData, awaitProcess, getManager, addItem, loadAssetCacheIndex, cancel, onProgress, onFileStart, onFileEnd, onRetry, onDownloadProgress, onComplete };
