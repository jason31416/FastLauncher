import { vanilla, fabric, awaitProcess, addItem } from './downloaders/index.js';

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

const testAdapt = {
        adaptVersion: 2,
        id: 'example-pack',
        name: 'Example Pack',
        packVersion: '1.0.0',
        installation: [
          { type: 'display', message: 'Installing example pack version 1.0.0' },
          { type: 'installBase', version: '26.1' },
          { type: 'installFabric', version: `26.1:latest` },
          { type: 'await' },
          { type: 'display', message: 'Finished!' },
        ]
      };

export function getCurrentPack() {
    return testAdapt;
}