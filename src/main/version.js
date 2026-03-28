import path from 'path';
import { downloadVersionManifest, downloadVersionJson, downloadAssetIndex } from './downloader.js';
import { getMinecraftDir, getOSNativesKey, filterByOS } from './utils.js';

const VERSION_ID = '1.21.1';

export class VersionManager {
  constructor() {
    this.manifest = null;
    this.versionJson = null;
    this.assetIndex = null;
  }

  async fetchManifest() {
    this.manifest = await downloadVersionManifest();
    return this.manifest;
  }

  async fetchVersionJson() {
    const version = this.manifest.versions.find(v => v.id === VERSION_ID);
    if (!version) throw new Error(`Version ${VERSION_ID} not found`);
    
    this.versionJson = await downloadVersionJson(version.url);
    
    const versionDir = path.join(getMinecraftDir(), 'versions', VERSION_ID);
    this.versionJson._versionPath = path.join(versionDir, `${VERSION_ID}.json`);
    
    return this.versionJson;
  }

  async fetchAssetIndex(downloadManager) {
    const { assetIndex } = this.versionJson;
    const indexPath = path.join('assets', 'indexes', `${assetIndex.id}.json`);
    
    if (downloadManager) {
      downloadManager.addItem({
        id: `asset-index-${assetIndex.id}`,
        path: indexPath,
        url: assetIndex.url,
        sha1: assetIndex.sha1,
        size: assetIndex.size,
        type: 'json'
      });
    }
    
    const indexUrl = assetIndex.url.replace('https://piston-meta.mojang.com/', 'https://bmclapi2.bangbang93.com/');
    this.assetIndex = await downloadAssetIndex(assetIndex.url);
    return this.assetIndex;
  }

  getDownloadList() {
    const items = [];
    const minecraftDir = getMinecraftDir();

    items.push({
      id: `client-jar-${VERSION_ID}`,
      path: path.join('versions', VERSION_ID, `${VERSION_ID}.jar`),
      url: this.versionJson.downloads.client.url,
      sha1: this.versionJson.downloads.client.sha1,
      size: this.versionJson.downloads.client.size,
      type: 'jar'
    });

    for (const lib of this.versionJson.libraries) {
      if (!filterByOS(lib.rules)) continue;

      const downloads = lib.downloads;
      
      if (downloads.artifact) {
        items.push({
          id: `lib-${lib.name}`,
          path: path.join('libraries', downloads.artifact.path),
          url: downloads.artifact.url,
          sha1: downloads.artifact.sha1,
          size: downloads.artifact.size,
          type: 'jar'
        });
      }

      if (downloads.classifiers) {
        const nativesKey = getOSNativesKey();
        if (nativesKey && downloads.classifiers[nativesKey]) {
          const native = downloads.classifiers[nativesKey];
          items.push({
            id: `natives-${lib.name}`,
            path: path.join('libraries', native.path),
            url: native.url,
            sha1: native.sha1,
            size: native.size,
            type: 'natives'
          });
        }
      }
    }

    if (this.versionJson.logging?.client) {
      const loggingFile = this.versionJson.logging.client.file;
      items.push({
        id: `logging-${loggingFile.id}`,
        path: path.join('assets', 'log_configs', loggingFile.id),
        url: loggingFile.url,
        sha1: loggingFile.sha1,
        size: loggingFile.size,
        type: 'logging'
      });
    }

    return items;
  }

  getAssetDownloadList() {
    if (!this.assetIndex?.objects) return [];
    
    const items = [];
    
    for (const [assetPath, assetInfo] of Object.entries(this.assetIndex.objects)) {
      const hash = assetInfo.hash;
      const hashPrefix = hash.substring(0, 2);
      
      items.push({
        id: `asset-${assetPath}`,
        path: path.join('assets', 'objects', hashPrefix, hash),
        url: `https://resources.download.minecraft.net/${hashPrefix}/${hash}`,
        sha1: hash,
        size: assetInfo.size,
        type: 'assets'
      });
    }
    
    return items;
  }

  getVersionInfo() {
    return {
      id: VERSION_ID,
      type: this.versionJson.type,
      releaseTime: this.versionJson.releaseTime,
      mainClass: this.versionJson.mainClass,
      minecraftDir: getMinecraftDir(),
      javaVersion: this.versionJson.javaVersion
    };
  }
}

export async function createVersionManager() {
  const manager = new VersionManager();
  await manager.fetchManifest();
  await manager.fetchVersionJson();
  return manager;
}
