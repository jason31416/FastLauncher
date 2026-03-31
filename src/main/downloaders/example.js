import { vanilla, fabric, awaitProcess, loadAssetCacheIndex } from './index.js';

export async function downloadWithFabric(mcVersion, fabricVersion) {
  await loadAssetCacheIndex();
  await vanilla.download(mcVersion);
  await fabric.download(`${mcVersion}:${fabricVersion}`);
  await awaitProcess();
}

export async function downloadVanillaOnly(mcVersion) {
  await loadAssetCacheIndex();
  await vanilla.download(mcVersion);
  await awaitProcess();
}
