import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { app } from 'electron';
import { platform, arch } from 'os';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ensureDir, formatBytes } from './utils.js';

const JAVA_DIR = path.join(app.getPath('home'), '.fastlauncher', 'java');
const ADOPTIUM_API = 'https://api.adoptium.net';

const GITHUB_DIRECT = 'https://github.com';
const PROXY_ORG = 'https://gh-proxy.org';

function getPlatform() {
  const p = platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'mac';
  if (p === 'linux') return 'linux';
  return p;
}

function getArch() {
  const a = arch();
  if (a === 'x64') return 'x64';
  if (a === 'arm64') return 'aarch64';
  return a;
}

function parseJavaVersion(output) {
  const match = output.match(/version\s+"([^"]+)"/);
  if (!match) return null;
  const version = match[1];
  const majorMatch = version.match(/^(\d+)/);
  return majorMatch ? parseInt(majorMatch[1], 10) : null;
}

async function pingUrl(url, timeout = 5000) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    return Date.now() - start;
  } catch (e) {
    return Infinity;
  }
}

async function findFastestMirror(url) {
  console.log(`[JAVA] Pinging sources for: ${url}`);

  const directLatency = await pingUrl(url);
  console.log(`[JAVA] Direct latency: ${directLatency === Infinity ? 'timeout' : directLatency + 'ms'}`);

  const proxyLatency = await pingUrl(`${PROXY_ORG}/${url}`);
  console.log(`[JAVA] Proxy latency: ${proxyLatency === Infinity ? 'timeout' : proxyLatency + 'ms'}`);

  if (directLatency <= proxyLatency) {
    console.log('[JAVA] Using direct connection');
    return { url, proxy: false };
  } else {
    console.log('[JAVA] Using proxy connection');
    return { url: `${PROXY_ORG}/${url}`, proxy: true };
  }
}

class JavaManager extends EventEmitter {
  constructor() {
    super();
    this.downloadProgress = 0;
    this.isDownloading = false;
  }

  async ensureJava(requiredVersion = 17) {
    const existingJava = await this.findJava(requiredVersion);
    if (existingJava) {
      return existingJava;
    }
    return this.downloadAndInstallJava(requiredVersion);
  }

  async findJava(requiredVersion = 17) {
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const javaPath = path.join(javaHome, 'bin', 'java');
      if (await this.validateJava(javaPath, requiredVersion)) {
        return javaPath;
      }
    }

    const localJava = await this.findLocalJava(requiredVersion);
    if (localJava) {
      return localJava;
    }

    return null;
  }

  async findLocalJava(requiredVersion) {
    try {
      const entries = await fs.readdir(JAVA_DIR);
      for (const entry of entries) {
        const javaPath = await this.findJavaInDir(path.join(JAVA_DIR, entry), requiredVersion);
        if (javaPath) {
          return javaPath;
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[JAVA] Error reading java dir:', e);
      }
    }
    return null;
  }

  async findJavaInDir(dir, requiredVersion) {
    const patterns = [
      path.join(dir, 'bin', 'java'),
      path.join(dir, 'Contents', 'Home', 'bin', 'java'),
    ];
    
    for (const javaPath of patterns) {
      if (await this.validateJava(javaPath, requiredVersion)) {
        return javaPath;
      }
    }
    
    try {
      const subdirs = await fs.readdir(dir);
      for (const subdir of subdirs) {
        const subPath = path.join(dir, subdir);
        const stat = await fs.stat(subPath);
        if (stat.isDirectory()) {
          const found = await this.findJavaInDir(subPath, requiredVersion);
          if (found) return found;
        }
      }
    } catch (e) {}
    
    return null;
  }

  async validateJava(javaPath, requiredVersion) {
    try {
      await fs.access(javaPath);
      const version = await this.getJavaVersion(javaPath);
      if (version && version >= requiredVersion) {
        console.log(`[JAVA] Found valid Java at ${javaPath}, version ${version}`);
        return true;
      }
    } catch (e) {
      console.log(`[JAVA] Java at ${javaPath} not valid: ${e.message}`);
    }
    return false;
  }

  async getJavaVersion(javaPath) {
    return new Promise((resolve) => {
      const proc = spawn(javaPath, ['-version'], { stdio: 'pipe' });
      let output = '';
      proc.stderr.on('data', (data) => { output += data.toString(); });
      proc.on('close', () => resolve(parseJavaVersion(output)));
      proc.on('error', () => resolve(null));
      setTimeout(() => { proc.kill(); resolve(null); }, 5000);
    });
  }

  async downloadAndInstallJava(version = 17) {
    if (this.isDownloading) {
      throw new Error('Java download already in progress');
    }

    this.isDownloading = true;
    this.emit('download-start', { version });

    try {
      const release = await this.getReleaseInfo(version);
      if (!release) {
        throw new Error(`Failed to get release info for Java ${version}`);
      }

      const { url, sha256, size, fileName } = release;
      console.log(`[JAVA] Downloading ${fileName} (${formatBytes(size)})`);

      const tempPath = path.join(os.tmpdir(), fileName);
      await this.downloadFile(url, tempPath, size, sha256);

      const installPath = path.join(JAVA_DIR, `jdk-${version}`);
      await ensureDir(JAVA_DIR);
      
      this.emit('download-stage', { stage: '解压中...', progress: 0 });
      await this.extractJava(tempPath, installPath, fileName);

      await fs.unlink(tempPath).catch(() => {});

      const javaPath = await this.findJavaInDir(installPath, version);
      if (!javaPath) {
        throw new Error(`Java not found after extraction in ${installPath}`);
      }

      console.log(`[JAVA] Java installed at ${javaPath}`);

      this.emit('download-complete', { version, javaPath });
      this.isDownloading = false;
      return javaPath;

    } catch (error) {
      this.isDownloading = false;
      this.emit('download-error', { error: error.message });
      throw error;
    }
  }

  async getReleaseInfo(version) {
    const os = getPlatform();
    const arch = getArch();

    const url = `${ADOPTIUM_API}/v3/assets/latest/${version}/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`;

    console.log(`[JAVA] Fetching release info from: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = await response.json();
      if (!data || data.length === 0) {
        throw new Error('No releases found');
      }

      const release = data[0];
      const pkg = release.binary?.package;
      if (!pkg) {
        throw new Error('No binary found in release');
      }

      const fileName = pkg.link.split('/').pop();

      return {
        url: pkg.link,
        sha256: pkg.checksum,
        size: pkg.size,
        fileName: fileName
      };
    } catch (e) {
      console.error('[JAVA] Failed to get release info:', e);
      return null;
    }
  }

  async downloadFile(url, destPath, totalSize, sha256) {
    this.emit('download-stage', { stage: '测速中...', progress: 0 });

    const mirror = await findFastestMirror(url);
    const downloadUrl = mirror.url;
    const downloadMethod = mirror.proxy ? '代理' : '直连';

    this.emit('download-stage', { stage: `开始下载 (${downloadMethod})`, progress: 0 });

    let retries = 0;
    const maxRetries = 3;
    let response;

    while (retries < maxRetries) {
      try {
        response = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        break;
      } catch (e) {
        retries++;
        console.error(`[JAVA] Download attempt ${retries} failed: ${e.message}`);

        if (retries < maxRetries) {
          const alternateUrl = mirror.proxy ? url : `${PROXY_ORG}/${url}`;
          console.log(`[JAVA] Retrying with alternate URL: ${alternateUrl}`);
          this.emit('download-retry', { attempt: retries, maxRetries, error: e.message });
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        throw e;
      }
    }

    const file = await fs.open(destPath, 'w');
    let downloaded = 0;

    try {
      const reader = response.body.getReader();
      const hash = crypto.createHash('sha256');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await file.write(Buffer.from(value));
        downloaded += value.length;
        hash.update(value);

        const progress = totalSize > 0 ? Math.floor((downloaded / totalSize) * 100) : 0;
        this.downloadProgress = progress;
        this.emit('download-progress', {
          downloaded,
          total: totalSize,
          progress,
          method: downloadMethod
        });
      }

      const actualHash = hash.digest('hex');
      if (sha256 && actualHash !== sha256.toLowerCase()) {
        throw new Error(`SHA256 校验失败`);
      }

      console.log(`[JAVA] Download completed via ${downloadMethod}`);
      this.emit('download-stage', { stage: '下载完成', progress: 100 });

    } finally {
      await file.close();
    }
  }

  async extractJava(zipPath, destPath, fileName) {
    console.log(`[JAVA] Extracting ${fileName} to ${destPath}`);

    await ensureDir(destPath);

    if (fileName.endsWith('.zip')) {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      let rootDir = null;

      for (const entry of entries) {
        if (entry.isDirectory) {
          const parts = entry.entryName.split('/');
          if (parts.length > 1 && parts[0]) {
            rootDir = parts[0];
            break;
          }
        }
      }

      if (rootDir) {
        for (const entry of entries) {
          const newName = entry.entryName.replace(rootDir + '/', '');
          if (newName && entry.entryName !== rootDir + '/') {
            const entryDest = path.join(destPath, newName);
            if (entry.isDirectory) {
              await ensureDir(entryDest);
            } else {
              await ensureDir(path.dirname(entryDest));
              zip.extractEntryTo(entry, destPath, false, true);
            }
          }
        }
      } else {
        zip.extractAllTo(destPath, true);
      }

    } else {
      await this.extractTarGz(zipPath, destPath);
    }

    console.log('[JAVA] Extraction complete');
  }

  async extractTarGz(zipPath, destPath) {
    return new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', zipPath, '-C', destPath]);
      tar.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited with code ${code}`));
      });
      tar.on('error', reject);
    });
  }

  async getJavaInfo() {
    const requiredVersion = 17;
    const javaPath = await this.findJava(requiredVersion);

    return {
      hasJava: !!javaPath,
      javaPath,
      requiredVersion,
      javaDir: JAVA_DIR
    };
  }
}

export const javaManager = new JavaManager();
export { JAVA_DIR };