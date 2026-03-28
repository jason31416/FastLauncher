import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { toBMCLAPI, verifySHA1, ensureDir, getMinecraftDir, formatBytes, sleep } from './utils.js';

const CONCURRENCY = 32;
const RETRY_DELAY_BASE = 2000;
const MAX_RETRY_DELAY = 60000;

class ThreadSafeQueue {
  constructor(items = []) {
    this._items = items;
    this._mutex = null;
  }

  async withMutex(fn) {
    while (this._mutex) {
      await sleep(10);
    }
    this._mutex = true;
    try {
      return await fn();
    } finally {
      this._mutex = false;
    }
  }

  push(item) {
    this._items.push(item);
  }

  pushFront(item) {
    this._items.unshift(item);
  }

  pop() {
    return this._items.shift();
  }

  get length() {
    return this._items.length;
  }

  get items() {
    return [...this._items];
  }
}

export class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.queue = new ThreadSafeQueue();
    this.downloading = new Set();
    this.completed = new Map();
    this.failed = new Map();
    this.totalSize = 0;
    this.downloadedSize = 0;
    this.currentFile = '';
    this.isRunning = false;
    this.isCancelled = false;
    this.concurrency = CONCURRENCY;
  }

  addItem(item) {
    this.queue.push(item);
    this.totalSize += item.size;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isCancelled = false;
    
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this._worker(i));
    }
    
    await Promise.all(workers);
    this.isRunning = false;
    this.emit('complete');
  }

  async cancel() {
    this.isCancelled = true;
  }

  async _worker(id) {
    while (!this.isCancelled) {
      const item = await this.queue.withMutex(() => this.queue.pop());
      
      if (!item) {
        await sleep(100);
        if (this.queue.length === 0 && this.downloading.size === 0) {
          break;
        }
        continue;
      }

      this.downloading.add(item.id);
      this.currentFile = item.path;
      this.emit('file-start', { workerId: id, id: item.id, path: item.path });

      let retries = 0;
      let success = false;

      while (!success && !this.isCancelled) {
        try {
          await this._downloadFile(item);
          success = true;
          this.completed.set(item.id, item);
          this.downloadedSize += item.size;
        } catch (e) {
          retries++;
          const delay = Math.min(RETRY_DELAY_BASE * Math.pow(2, retries - 1), MAX_RETRY_DELAY);
          this.emit('retry', { id: item.id, path: item.path, attempt: retries, error: e.message, delay });
          
          if (!this.isCancelled) {
            await sleep(delay);
            this.queue.push(item);
          }
        }
      }

      this.downloading.delete(item.id);
      this.emit('progress', {
        completed: this.completed.size,
        failed: this.failed.size,
        total: this.completed.size + this.failed.size + this.downloading.size + this.queue.length,
        downloadedSize: this.downloadedSize,
        totalSize: this.totalSize,
        currentFile: item.path,
        speed: this._calculateSpeed()
      });
    }
  }

  async _downloadFile(item) {
    const filePath = path.join(getMinecraftDir(), item.path);
    await ensureDir(path.dirname(filePath));

    if (await verifySHA1(filePath, item.sha1)) {
      return;
    }

    const url = toBMCLAPI(item.url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const total = parseInt(response.headers.get('content-length') || item.size, 10);
    let downloaded = 0;

    const file = await fs.open(filePath, 'w');
    
    try {
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await file.write(Buffer.from(value));
        downloaded += value.length;
        
        this.emit('download-progress', {
          id: item.id,
          path: item.path,
          downloaded,
          total,
          speed: this._calculateSpeed()
        });
      }
    } finally {
      await file.close();
    }

    if (item.sha1 && !await verifySHA1(filePath, item.sha1)) {
      await fs.unlink(filePath).catch(() => {});
      throw new Error('SHA1 verification failed');
    }
  }

  _calculateSpeed() {
    return this.downloadedSize;
  }

  getStatus() {
    return {
      completed: this.completed.size,
      failed: this.failed.size,
      downloading: this.downloading.size,
      queued: this.queue.length,
      downloadedSize: this.downloadedSize,
      totalSize: this.totalSize,
      currentFile: this.currentFile,
      isRunning: this.isRunning
    };
  }
}

export async function downloadVersionManifest() {
  const { META_URL, toBMCLAPI } = await import('./utils.js');
  const url = toBMCLAPI(META_URL);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch version manifest: ${response.status}`);
  return response.json();
}

export async function downloadVersionJson(versionUrl) {
  const url = toBMCLAPI(versionUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch version JSON: ${response.status}`);
  return response.json();
}

export async function downloadAssetIndex(assetIndexUrl) {
  const url = toBMCLAPI(assetIndexUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch asset index: ${response.status}`);
  return response.json();
}
