import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = 'config.json';

let settingsCache = null;

export async function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, CONFIG_FILE);
}

export async function loadSettings() {
  if (settingsCache !== null) {
    return settingsCache;
  }

  try {
    const configPath = await getConfigPath();
    const data = await fs.readFile(configPath, 'utf-8');
    settingsCache = JSON.parse(data);
    return settingsCache;
  } catch (e) {
    if (e.code === 'ENOENT') {
      settingsCache = { minecraftDir: null, firstLaunch: true };
      return settingsCache;
    }
    throw e;
  }
}

export async function saveSettings(newSettings) {
  const configPath = await getConfigPath();
  const currentSettings = await loadSettings();
  const mergedSettings = { ...currentSettings, ...newSettings };
  await fs.writeFile(configPath, JSON.stringify(mergedSettings, null, 2), 'utf-8');
  settingsCache = mergedSettings;
  return mergedSettings;
}

export function getMinecraftDirFromSettings() {
  if (settingsCache && settingsCache.minecraftDir) {
    return settingsCache.minecraftDir;
  }
  return null;
}

export function clearSettingsCache() {
  settingsCache = null;
}