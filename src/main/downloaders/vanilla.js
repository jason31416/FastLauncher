import path from 'path';
import { downloadVersionManifest, downloadVersionJson, downloadAssetIndex, readVersionJsonCache, writeVersionJsonCache } from '../downloader.js';
import { getMinecraftDir, getOSNativesKey, filterByOS } from '../utils.js';
import { addItem } from './queue.js';

/** In-memory cache for version JSONs, keyed by version ID */
let _versionJsonCache = new Map();

/**
 * Queue all downloads for a vanilla Minecraft version.
 * Downloads: version manifest, version JSON, asset index, client JAR, libraries, natives, assets.
 */
export async function download(versionId) {
  await ensureVersionManifest();
  const versionJson = await fetchVersionJson(versionId);
  const assetIndex = await fetchAssetIndex(versionId);
  buildAndQueueLibDownloads(versionJson);
  buildAndQueueAssetDownloads(assetIndex.objects);
}

/** Fetch and cache the Minecraft version manifest (list of all versions) */
async function ensureVersionManifest() {
  const cached = await readVersionJsonCache('manifest');
  if (cached) {
    _versionJsonCache.set('manifest', cached);
    return cached;
  }
  const manifest = await downloadVersionManifest();
  _versionJsonCache.set('manifest', manifest);
  await writeVersionJsonCache('manifest', manifest);
  return manifest;
}

/** Find version JSON from manifest, download if not cached */
async function fetchVersionJson(versionId) {
  if (_versionJsonCache.has(versionId)) {
    return _versionJsonCache.get(versionId);
  }
  const manifest = _versionJsonCache.get('manifest');
  const version = manifest.versions.find(v => v.id === versionId);
  if (!version) {
    throw new Error(`Version ${versionId} not found in manifest`);
  }
  const versionJson = await downloadVersionJson(version.url, version.id);
  _versionJsonCache.set(versionId, versionJson);
  return versionJson;
}

/** Queue the asset index JSON download and return the parsed index */
async function fetchAssetIndex(versionId) {
  const versionJson = _versionJsonCache.get(versionId);
  if (!versionJson) return null;
  const { assetIndex } = versionJson;
  const indexPath = path.join('assets', 'indexes', `${assetIndex.id}.json`);
  addItem({
    id: `asset-index-${assetIndex.id}`,
    path: indexPath,
    url: assetIndex.url,
    sha1: assetIndex.sha1,
    size: assetIndex.size,
    type: 'json'
  });
  return await downloadAssetIndex(assetIndex.url, assetIndex.id);
}

/** Queue client JAR and all library/native downloads for the version */
function buildAndQueueLibDownloads(versionJson) {
  if (!versionJson) return;
  const versionId = versionJson.id;

  addItem({
    id: `client-jar-${versionId}`,
    path: path.join('versions', versionId, `${versionId}.jar`),
    url: versionJson.downloads.client.url,
    sha1: versionJson.downloads.client.sha1,
    size: versionJson.downloads.client.size,
    type: 'jar'
  });

  for (const lib of versionJson.libraries) {
    if (!filterByOS(lib.rules)) continue;
    const downloads = lib.downloads;
    if (downloads.artifact) {
      addItem({
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
        addItem({
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

  if (versionJson.logging?.client) {
    const loggingFile = versionJson.logging.client.file;
    addItem({
      id: `logging-${loggingFile.id}`,
      path: path.join('assets', 'log_configs', loggingFile.id),
      url: loggingFile.url,
      sha1: loggingFile.sha1,
      size: loggingFile.size,
      type: 'logging'
    });
  }
}

/** Queue all asset object downloads (textures, sounds, etc.) */
function buildAndQueueAssetDownloads(objects) {
  if (!objects) return;
  for (const [assetPath, assetInfo] of Object.entries(objects)) {
    const hash = assetInfo.hash;
    const hashPrefix = hash.substring(0, 2);
    addItem({
      id: `asset-${assetPath}`,
      path: path.join('assets', 'objects', hashPrefix, hash),
      url: `https://resources.download.minecraft.net/${hashPrefix}/${hash}`,
      sha1: hash,
      size: assetInfo.size,
      type: 'assets'
    });
  }
}

/** Get version info for UI display (does not download) */
export function getVersionInfo(versionId) {
  const versionJson = _versionJsonCache.get(versionId);
  if (!versionJson) return null;
  return {
    id: versionJson.id,
    type: versionJson.type,
    releaseTime: versionJson.releaseTime,
    mainClass: versionJson.mainClass,
    minecraftDir: getMinecraftDir(),
    javaVersion: versionJson.javaVersion
  };
}

/** Get raw version JSON from memory or disk cache (does not download) */
export async function getVersionJson(versionId) {
  if (_versionJsonCache.has(versionId)) {
    return _versionJsonCache.get(versionId);
  }
  const cached = await readVersionJsonCache(versionId);
  if (cached) {
    _versionJsonCache.set(versionId, cached);
    return cached;
  }
  return null;
}


