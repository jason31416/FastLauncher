import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { toBMCLAPI, verifySHA1, ensureDir, getMinecraftDir, getBaseDir, formatBytes, sleep } from './utils.js';
import { checkFullyInstalled } from './installStatus.js';

const CONCURRENCY = 32;
const RETRY_DELAY_BASE = 2000;
const MAX_RETRY_DELAY = 60000;
const RATE_LIMIT_DELAY = 5000;

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
    this.downloadedBytes = new Map();
    this.assetCacheIndex = new Map();
    this.assetIndexDirty = false;
    this.assetIndexTimer = null;
    this.skipIntegrityCheck = false;
  }

  async loadAssetCacheIndex() {
    try {
      const { app } = await import('electron');
      const cachePath = path.join(app.getPath('userData'), 'cache', 'asset.json');
      const data = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.assetCacheIndex = new Map(Object.entries(parsed));
      console.log(`[ASSET INDEX] Loaded ${this.assetCacheIndex.size} entries`);
    } catch {
      this.assetCacheIndex = new Map();
    }
  }

  async saveAssetCacheIndex() {
    if (this.assetCacheIndex.size === 0) return;
    try {
      const { app } = await import('electron');
      const cacheDir = path.join(app.getPath('userData'), 'cache');
      await ensureDir(cacheDir);
      const cachePath = path.join(cacheDir, 'asset.json');
      const obj = Object.fromEntries(this.assetCacheIndex);
      await fs.writeFile(cachePath, JSON.stringify(obj, null, 2), 'utf-8');
      this.assetIndexDirty = false;
    } catch (e) {
      console.error('[ASSET INDEX] Save failed:', e.message);
    }
  }

  _startAssetIndexTimer() {
    this.assetIndexTimer = setInterval(async () => {
      if (this.assetIndexDirty) {
        await this.saveAssetCacheIndex();
      }
    }, 3000);
  }

  _stopAssetIndexTimer() {
    if (this.assetIndexTimer) {
      clearInterval(this.assetIndexTimer);
      this.assetIndexTimer = null;
    }
  }

  findAssetBySha1(sha1) {
    return this.assetCacheIndex.get(sha1);
  }

  registerAssetToIndex(sha1, assetPath) {
    this.assetCacheIndex.set(sha1, assetPath);
    this.assetIndexDirty = true;
  }

  addItem(item) {
    this.queue.push(item);
    this.totalSize += item.size;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isCancelled = false;
    this._startAssetIndexTimer();

    this.skipIntegrityCheck = await checkFullyInstalled();
    
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this._worker(i));
    }
    
    await Promise.all(workers);
    this._stopAssetIndexTimer();
    this.isRunning = false;
    await this.saveAssetCacheIndex();
    this.emit('complete');
  }

  async cancel() {
    this.isCancelled = true;
    this._stopAssetIndexTimer();
    await this.saveAssetCacheIndex();
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
          this.downloadedBytes.delete(item.id);
          this.emit('file-end', { workerId: id, id: item.id, path: item.path, retry: false });
        } catch (e) {
          retries++;
          const downloadedForItem = this.downloadedBytes.get(item.id) || 0;
          this.downloadedSize -= downloadedForItem;
          this.downloadedBytes.delete(item.id);
          this.emit('file-end', { workerId: id, id: item.id, path: item.path, retry: true });
          
          const downloadUrl = toBMCLAPI(item.url);
          console.error(`[DOWNLOAD FAILED] File: ${item.path}, URL: ${downloadUrl}, SHA1: ${item.sha1}, Error: ${e.message}`);
          
          let delay = Math.min(RETRY_DELAY_BASE * Math.pow(2, retries - 1), MAX_RETRY_DELAY);
          
          if (e.message.includes('429')) {
            delay = RATE_LIMIT_DELAY;
            console.warn(`[RATE LIMIT] Waiting ${delay}ms before retry for ${item.path}`);
          }
          
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

    if (item.type === 'assets' && item.sha1) {
      const existingPath = this.findAssetBySha1(item.sha1);
      if (existingPath) {
        const srcPath = existingPath;
        try {
          await fs.access(srcPath);
          await fs.copyFile(srcPath, filePath);
          this.downloadedSize += item.size;
          return;
        } catch {
          // Source doesn't exist, continue with download
        }
      }
    }

    if (item.sha1) {
      if (this.skipIntegrityCheck) {
        try {
          await fs.access(filePath);
          this.registerAssetToIndex(item.sha1, path.join(getMinecraftDir(), item.path));
          this.downloadedSize += item.size;
          return;
        } catch {
          // File doesn't exist, continue with download
        }
      } else if (await verifySHA1(filePath, item.sha1)) {
        this.registerAssetToIndex(item.sha1, path.join(getMinecraftDir(), item.path));
        this.downloadedSize += item.size;
        return;
      }
    } else {
      try {
        await fs.access(filePath);
        this.downloadedSize += item.size || 0;
        return;
      } catch {
        // File doesn't exist, continue with download
      }
    }



    let response = await this._fetchWithFallback(item.url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const total = parseInt(response.headers.get('content-length') || item.size, 10);
    let downloaded = 0;

    const file = await fs.open(filePath, 'w');
    
    try {
      const reader = response.body.getReader();
      this.downloadedBytes.set(item.id, 0);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await file.write(Buffer.from(value));
        downloaded += value.length;
        this.downloadedSize += value.length;
        this.downloadedBytes.set(item.id, downloaded);
        
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

    if (item.sha1 && !this.skipIntegrityCheck && !await verifySHA1(filePath, item.sha1)) {
      await fs.unlink(filePath).catch(() => {});
      const downloadedForItem = this.downloadedBytes.get(item.id) || 0;
      this.downloadedSize -= downloadedForItem;
      this.downloadedBytes.delete(item.id);
      throw new Error('SHA1 verification failed');
    }
  }

  _calculateSpeed() {
    return this.downloadedSize;
  }

  async _fetchWithFallback(originalUrl) {
    const bmclUrl = toBMCLAPI(originalUrl);
    
    try {
      let response = await fetch(bmclUrl);
      
      if (!response.ok && response.status !== 404) {
        console.warn(`[BMCLAPI ERROR ${response.status}] Falling back to original URL: ${originalUrl}`);
        response = await fetch(originalUrl);
      } else if (response.status === 404) {
        console.warn(`[BMCLAPI 404] Falling back to original URL: ${originalUrl}`);
        response = await fetch(originalUrl);
      }
      
      return response;
    } catch (e) {
      console.warn(`[BMCLAPI FETCH FAILED] Falling back to original URL: ${originalUrl}, Error: ${e.message}`);
      return await fetch(originalUrl);
    }
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
  let response = await fetch(url);
  if (response.status === 404) {
    console.warn(`[BMCLAPI 404] Falling back to original URL: ${META_URL}`);
    response = await fetch(META_URL);
  }
  if (!response.ok) throw new Error(`Failed to fetch version manifest: ${response.status}`);
  return response.json();
}

async function getVersionJsonCachePath(versionId) {
  const cacheDir = path.join(getMinecraftDir(), 'cache', 'versions');
  return path.join(cacheDir, `${versionId}.json`);
}

export async function readVersionJsonCache(versionId) {
  try {
    const cachePath = await getVersionJsonCachePath(versionId);
    console.log(`[VERSION CACHE] Read from: ${cachePath}`);
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.log(`[VERSION CACHE] Miss: ${e.code}`);
    return null;
  }
}

export async function writeVersionJsonCache(versionId, versionJson) {
  const cacheDir = path.join(getMinecraftDir(), 'cache', 'versions');
  await ensureDir(cacheDir);
  const cachePath = await getVersionJsonCachePath(versionId);
  console.log(`[VERSION CACHE] Write to: ${cachePath}`);
  await fs.writeFile(cachePath, JSON.stringify(versionJson, null, 2), 'utf-8');
}

export async function downloadVersionJson(versionUrl, versionId) {
  const cached = await readVersionJsonCache(versionId);
  if (cached) {
    return cached;
  }

  const url = toBMCLAPI(versionUrl);
  let response = await fetch(url);
  if (response.status === 404) {
    console.warn(`[BMCLAPI 404] Falling back to original URL: ${versionUrl}`);
    response = await fetch(versionUrl);
  }
  if (!response.ok) throw new Error(`Failed to fetch version JSON: ${response.status}`);
  const versionJson = await response.json();
  await writeVersionJsonCache(versionId, versionJson);
  return versionJson;
}

async function getAssetIndexCachePath(assetIndexId) {
  const { app } = await import('electron');
  const cacheDir = path.join(app.getPath('userData'), 'cache', 'assets');
  return path.join(cacheDir, `indexes`, `${assetIndexId}.json`);
}

async function readAssetIndexCache(assetIndexId) {
  try {
    const cachePath = await getAssetIndexCachePath(assetIndexId);
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeAssetIndexCache(assetIndexId, assetIndex) {
  const { app } = await import('electron');
  const cacheDir = path.join(app.getPath('userData'), 'cache', 'assets', 'indexes');
  await ensureDir(cacheDir);
  const cachePath = await getAssetIndexCachePath(assetIndexId);
  await fs.writeFile(cachePath, JSON.stringify(assetIndex, null, 2), 'utf-8');
}

export async function downloadAssetIndex(assetIndexUrl, assetIndexId) {
  const cached = await readAssetIndexCache(assetIndexId);
  if (cached) {
    return cached;
  }

  const url = toBMCLAPI(assetIndexUrl);
  let response = await fetch(url);
  if (response.status === 404) {
    console.warn(`[BMCLAPI 404] Falling back to original URL: ${assetIndexUrl}`);
    response = await fetch(assetIndexUrl);
  }
  if (!response.ok) throw new Error(`Failed to fetch asset index: ${response.status}`);
  const assetIndex = await response.json();
  await writeAssetIndexCache(assetIndexId, assetIndex);
  return assetIndex;
}
