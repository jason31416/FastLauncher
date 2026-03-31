import fs from 'fs/promises';
import path from 'path';
import { getMinecraftDir } from './utils.js';

const STATUS_FILE = 'install_status.json';

export async function checkFullyInstalled() {
  try {
    const filePath = path.join(getMinecraftDir(), STATUS_FILE);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { fullyInstalled: false };
  }
}

export async function markFullyInstalled(info = {}) {
  const filePath = path.join(getMinecraftDir(), STATUS_FILE);
  const status = {
    fullyInstalled: true,
    installedAt: new Date().toISOString(),
    mcVersion: info.mcVersion || null,
    fabricEnabled: info.fabricEnabled || false,
    fabricData: info.fabricData || null
  };
  await fs.writeFile(filePath, JSON.stringify(status, null, 2), 'utf-8');
  return status;
}