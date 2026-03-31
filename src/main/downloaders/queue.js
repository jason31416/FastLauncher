import { DownloadManager } from '../downloader.js';

let _manager = null;

export function getManager() {
  if (!_manager) {
    _manager = new DownloadManager();
  }
  return _manager;
}

export async function loadAssetCacheIndex() {
  return await getManager().loadAssetCacheIndex();
}

export function addItem(item) {
  getManager().addItem(item);
}

export function awaitProcess(setCompleteness) {
  return new Promise((resolve) => {
    getManager().once('complete', resolve);
    getManager().start(setCompleteness);
  });
}

export function resetManager() {
  _manager = null;
}

export function onProgress(handler) {
  getManager().on('progress', handler);
}

export function onFileStart(handler) {
  getManager().on('file-start', handler);
}

export function onFileEnd(handler) {
  getManager().on('file-end', handler);
}

export function onRetry(handler) {
  getManager().on('retry', handler);
}

export function onDownloadProgress(handler) {
  getManager().on('download-progress', handler);
}

export function onComplete(handler) {
  getManager().on('complete', handler);
}

export async function cancel() {
  if (_manager) {
    await _manager.cancel();
  }
}
