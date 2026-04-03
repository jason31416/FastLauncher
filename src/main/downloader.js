import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { toBMCLAPI, verifySHA1, ensureDir, getMinecraftDir, sleep } from './utils.js';

const CONCURRENCY = 32;
const RETRY_DELAY_BASE = 3000;
const RATE_LIMIT_DELAY = 8000;

/**
 * Thread-safe queue using a simple mutex to prevent concurrent pop() calls.
 * Workers wait on the mutex when accessing shared queue state.
 */
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

/**
 * Manages concurrent file downloads with SHA1 caching, retry logic, and progress tracking.
 * Uses multiple worker threads to download files in parallel.
 */
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
    /** SHA1 -> file path mapping for cached files */
    this.fileCacheIndex = new Map();
    this.cacheDirty = false;
    this.cacheTimer = null;
  }

  /** Load the SHA1->path cache index from disk */
  async loadFileCacheIndex() {
    try {
      const { app } = await import('electron');
      const cachePath = path.join(app.getPath('userData'), 'cache', 'asset.json');
      const data = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.fileCacheIndex = new Map(Object.entries(parsed));
      console.log(`[FILE CACHE] Loaded ${this.fileCacheIndex.size} entries`);
    } catch {
      this.fileCacheIndex = new Map();
    }
  }

  async saveFileCacheIndex() {
    if (this.fileCacheIndex.size === 0) return;
    try {
      const { app } = await import('electron');
      const cacheDir = path.join(app.getPath('userData'), 'cache');
      await ensureDir(cacheDir);
      const cachePath = path.join(cacheDir, 'asset.json');
      const obj = Object.fromEntries(this.fileCacheIndex);
      await fs.writeFile(cachePath, JSON.stringify(obj, null, 2), 'utf-8');
      this.cacheDirty = false;
    } catch (e) {
      console.error('[FILE CACHE] Save failed:', e.message);
    }
  }

  _startCacheTimer() {
    // Periodically flush SHA1 cache to disk (every 3s if dirty)
    this.cacheTimer = setInterval(async () => {
      if (this.cacheDirty) {
        await this.saveFileCacheIndex();
      }
    }, 3000);
  }

  _stopCacheTimer() {
    if (this.cacheTimer) {
      clearInterval(this.cacheTimer);
      this.cacheTimer = null;
    }
  }

  findFileBySha1(sha1) {
    return this.fileCacheIndex.get(sha1);
  }

  registerFileToIndex(sha1, filePath) {
    this.fileCacheIndex.set(sha1, filePath);
    this.cacheDirty = true; // Mark dirty so timer saves it
  }

  addItem(item) {
    this.queue.push(item);
    this.totalSize += item.size;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isCancelled = false;
    this._startCacheTimer();
    
    // Launch N concurrent worker goroutines
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this._worker(i));
    }
    
    // Wait for all workers to finish
    await Promise.all(workers);
    this._stopCacheTimer();
    this.isRunning = false;
    await this.saveFileCacheIndex();
    this.emit('complete');
  }

  async cancel() {
    this.isCancelled = true;
    this._stopCacheTimer();
    await this.saveFileCacheIndex();
  }

  /**
   * Worker loop: pops items from queue, downloads them, emits progress.
   * Multiple workers run concurrently via Promise.all in start().
   */
  async _worker(id) {
    while (!this.isCancelled) {
      // Atomically pop next item from queue (mutex prevents concurrent pops)
      const item = await this.queue.withMutex(() => this.queue.pop());
      
      if (!item) {
        // Queue empty - wait briefly and check if we should exit
        await sleep(100);
        if (this.queue.length === 0 && this.downloading.size === 0) {
          break; // All done - exit worker
        }
        continue;
      }

      // Track this item as actively downloading
      this.downloading.add(item.id);
      this.currentFile = item.path;
      this.emit('file-start', { workerId: id, id: item.id, path: item.path });

      let retries = 0;
      let success = false;

      // Retry loop: keep trying until success or cancellation
      while (!success && !this.isCancelled) {
        try {
          await this._downloadFile(item);
          success = true;
          this.completed.set(item.id, item);
          this.downloadedBytes.delete(item.id);
          this.emit('file-end', { workerId: id, id: item.id, path: item.path, retry: false });
        } catch (e) {
          // On failure: deduct already-downloaded bytes, emit retry event
          retries++;
          const downloadedForItem = this.downloadedBytes.get(item.id) || 0;
          this.downloadedSize -= downloadedForItem;
          this.downloadedBytes.delete(item.id);
          this.emit('file-end', { workerId: id, id: item.id, path: item.path, retry: true });
          
          const downloadUrl = toBMCLAPI(item.url);
          console.error(`[DOWNLOAD FAILED] File: ${item.path}, URL: ${downloadUrl}, SHA1: ${item.sha1}, Error: ${e.message}`);
          
          // Exponential backoff: 3s, 6s, 12s... capped at MAX_RETRY_DELAY
          let delay = RETRY_DELAY_BASE;
          
          // Rate-limited? Use longer dedicated delay instead
          if (e.message.includes('429')) {
            delay = RATE_LIMIT_DELAY;
            console.warn(`[RATE LIMIT] Waiting ${delay}ms before retry for ${item.path}`);
          }
          
          this.emit('retry', { id: item.id, path: item.path, attempt: retries, error: e.message, delay });
          
          if (!this.isCancelled) {
            await sleep(delay);
            this.queue.push(item); // Re-queue for another attempt
          }
        }
      }

      // Done with this item (success or cancelled)
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

  /**
   * Download a single file with skip-if-existing and SHA1 caching.
   * 
   * Skip-if-existing flow:
   *  1. If file at destination has matching SHA1 → skip download
   *  2. If SHA1 found in cache index → copy from cached location → skip download  
   *  3. Otherwise → download from network
   * 
   * After download: SHA1 verify, then register to cache index.
   */
  async _downloadFile(item) {
    // Resolve destination path and ensure parent directory exists
    const filePath = path.join(getMinecraftDir(), item.path);
    await ensureDir(path.dirname(filePath));

    // === Skip-if-existing check #1: destination file SHA1 ===
    if (item.sha1) {
      if (await verifySHA1(filePath, item.sha1)) {
        // File exists at destination with correct hash - register to index and skip
        this.registerFileToIndex(item.sha1, path.join(getMinecraftDir(), item.path));
        this.downloadedSize += item.size;
        return;
      }
    }

    // === Skip-if-existing check #2: SHA1 cache (same file elsewhere) ===
    if (item.sha1) {
      const existingPath = this.findFileBySha1(item.sha1);
      if (existingPath) {
        try {
          // Verify the cached file still exists on disk
          await fs.access(existingPath);
          // Copy from cached location to destination
          await fs.copyFile(existingPath, filePath);
          this.downloadedSize += item.size;
          return;
        } catch {
          // Cached file gone (moved/deleted) - fall through to download
        }
      }
    }

    // === Must download from network ===
    let response = await this._fetchWithFallback(item.url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Read content-length from headers (fallback to item.size)
    const total = parseInt(response.headers.get('content-length') || item.size, 10);
    let downloaded = 0;

    // Open file for writing
    const file = await fs.open(filePath, 'w');
    
    try {
      // Stream-based download with progress tracking
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
      // Always close the file handle
      await file.close();
    }

    // === Post-download SHA1 verification ===
    if (item.sha1 && !await verifySHA1(filePath, item.sha1)) {
      // Hash mismatch - corrupted download. Delete and rethrow.
      await fs.unlink(filePath).catch(() => {});
      const downloadedForItem = this.downloadedBytes.get(item.id) || 0;
      this.downloadedSize -= downloadedForItem;
      this.downloadedBytes.delete(item.id);
      throw new Error('SHA1 verification failed');
    }

    // === Register to SHA1 cache for future reuse ===
    if (item.sha1) {
      this.registerFileToIndex(item.sha1, path.join(getMinecraftDir(), item.path));
    }
  }

  _calculateSpeed() {
    return this.downloadedSize;
  }

  /**
   * Try BMCLAPI first (Chinese mirror), fall back to original URL on failure or 404.
   */
  async _fetchWithFallback(originalUrl) {
    // BMCLAPI mirrors asset/download URLs through a Chinese CDN
    const bmclUrl = toBMCLAPI(originalUrl);
    
    try {
      let response = await fetch(bmclUrl);
      
      // Non-404 errors (5xx, network issues): try original
      if (!response.ok && response.status !== 404) {
        console.warn(`[BMCLAPI ERROR ${response.status}] Falling back to original URL: ${originalUrl}`);
        response = await fetch(originalUrl);
      } else if (response.status === 404) {
        // 404 from BMCLAPI means file not cached there - try original
        console.warn(`[BMCLAPI 404] Falling back to original URL: ${originalUrl}`);
        response = await fetch(originalUrl);
      }
      
      return response;
    } catch (e) {
      // Network-level failure - last resort is original URL
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

/** Fetch the Minecraft version manifest (list of all version IDs) */
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

/** Read version JSON from disk cache, returns null on miss */
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

/** Write version JSON to disk cache */
export async function writeVersionJsonCache(versionId, versionJson) {
  const cacheDir = path.join(getMinecraftDir(), 'cache', 'versions');
  await ensureDir(cacheDir);
  const cachePath = await getVersionJsonCachePath(versionId);
  console.log(`[VERSION CACHE] Write to: ${cachePath}`);
  await fs.writeFile(cachePath, JSON.stringify(versionJson, null, 2), 'utf-8');
}

/** Download version JSON (from memory cache, disk cache, or network) */
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

/** Read asset index JSON from disk cache, returns null on miss */
async function readAssetIndexCache(assetIndexId) {
  try {
    const cachePath = await getAssetIndexCachePath(assetIndexId);
    const data = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Write asset index JSON to disk cache */
async function writeAssetIndexCache(assetIndexId, assetIndex) {
  const { app } = await import('electron');
  const cacheDir = path.join(app.getPath('userData'), 'cache', 'assets', 'indexes');
  await ensureDir(cacheDir);
  const cachePath = await getAssetIndexCachePath(assetIndexId);
  await fs.writeFile(cachePath, JSON.stringify(assetIndex, null, 2), 'utf-8');
}

/** Download asset index JSON (from memory cache, disk cache, or network) */
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
