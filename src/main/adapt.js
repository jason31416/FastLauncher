import { vanilla, fabric, awaitProcess, addItem } from './downloaders/index.js';
import { getCurrentPackId, getCurrentPackName } from './versionManager.js';

let _baseVersion = null;

export async function installWithAdapt(adapt, sendToRenderer) {
  if (!adapt?.installation?.length) {
    throw new Error('[ADAPT] Invalid adapt: missing or empty installation array');
  }

  for (const step of adapt.installation) {
    switch (step.type) {
      case 'display':
        sendToRenderer('state-change', { state: 'downloading', message: step.message });
        break;

      case 'installBase':
        await vanilla.download(step.version);
        _baseVersion = step.version;
        sendToRenderer('version-info', { id: adapt.name || adapt.id });
        break;

      case 'installFabric':
        await fabric.download(step.version);
        break;

      case 'await':
        await awaitProcess();
        break;

      case 'download':
        addItem({
          id: `download-${step.path}`,
          path: step.path,
          url: step.url,
          sha1: step.sha1 || null,
          size: step.size || 0,
          type: 'download'
        });
        break;

      default:
        console.error(`[ADAPT] Unknown instruction type: ${step.type}`);
    }
  }
}

export function getBaseVersion() {
  return _baseVersion;
}

export function getCurrentPack() {
  return {
    id: getCurrentPackId(),
    name: getCurrentPackName()
  };
}