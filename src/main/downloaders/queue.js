import { DownloadManager } from '../downloader.js';

/** Shared DownloadManager singleton */
let _manager = null;

export function getManager() {
  if (!_manager) {
    _manager = new DownloadManager();
  }
  return _manager;
}

export async function loadFileCacheIndex() {
  return await getManager().loadFileCacheIndex();
}

/**
 * Add a file to the download queue.
 * @param {{ id: string, path: string, url: string, sha1: string|null, size: number, type: string }} item
 */
export function addItem(item) {
  getManager().addItem(item);
}

/**
 * Wait for all queued downloads to complete.
 * Resolves when the 'complete' event fires.
 */
export function awaitProcess(setCompleteness) {
  return new Promise((resolve) => {
    getManager().once('complete', resolve);
    getManager().start(setCompleteness);
  });
}

/** Overall progress update: { completed, failed, total, downloadedSize, totalSize, currentFile, speed } */
export function onProgress(handler) {
  getManager().on('progress', handler);
}

/** Fired when a worker starts downloading a file: { workerId, id, path } */
export function onFileStart(handler) {
  getManager().on('file-start', handler);
}

/** Fired when a file download finishes (success or retry): { workerId, id, path, retry } */
export function onFileEnd(handler) {
  getManager().on('file-end', handler);
}

/** Fired when a download fails and will be retried: { id, path, attempt, error, delay } */
export function onRetry(handler) {
  getManager().on('retry', handler);
}

/** Per-file download progress: { id, path, downloaded, total, speed } */
export function onDownloadProgress(handler) {
  getManager().on('download-progress', handler);
}

/** Fired when all downloads complete */
export function onComplete(handler) {
  getManager().on('complete', handler);
}

/** Cancel all ongoing downloads */
export async function cancel() {
  if (_manager) {
    await _manager.cancel();
  }
}
