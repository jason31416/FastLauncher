import fs from 'fs/promises';
import path from 'path';
import { getBaseDir } from './utils.js';

const STATUS_FILE = 'install_status.json';

async function scanMods(instancePath) {
  const modsPath = path.join(instancePath, 'mods');
  try {
    await fs.access(modsPath);
  } catch {
    return null;
  }

  try {
    const files = await fs.readdir(modsPath);
    const mods = [];

    for (const file of files) {
      if (!file.endsWith('.jar')) continue;

      const nameParts = file.slice(0, -4).split('-');
      if (nameParts.length < 2) continue;

      const version = nameParts.pop();
      const id = nameParts.join('-');

      mods.push({ id, name: id, version });
    }

    return mods;
  } catch {
    return null;
  }
}

export async function getInstalledVersions() {
  const baseDir = getBaseDir();
  const versions = [];

  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    console.error('[GET_INSTALLED_VERSIONS] Error reading base dir:', error.message);
    throw new Error('Failed to read versions directory', { cause: error });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const instancePath = path.join(baseDir, entry.name);
    const statusPath = path.join(instancePath, STATUS_FILE);

    let status;
    try {
      const data = await fs.readFile(statusPath, 'utf-8');
      status = JSON.parse(data);
    } catch {
      continue;
    }

    if (status.fullyInstalled !== true) continue;

    versions.push({
      id: entry.name,
      name: entry.name,
      installedAt: status.installedAt || null,
    });
  }

  return versions;
}

export async function getVersionDetails(versionId) {
  const instancePath = path.join(getBaseDir(), versionId);
  const statusPath = path.join(instancePath, STATUS_FILE);

  let status;
  try {
    const data = await fs.readFile(statusPath, 'utf-8');
    status = JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Version not found', { cause: error });
    }
    throw new Error('Failed to read version data', { cause: error });
  }

  const frameworks = [];
  if (status.fabricEnabled) {
    frameworks.push('fabric');
  }

  const mods = await scanMods(instancePath);

  return {
    id: versionId,
    minecraftVersion: status.mcVersion || null,
    frameworks,
    mods,
  };
}