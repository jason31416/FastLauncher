import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { platform, arch } from 'os';

export const BMCLAPI_BASE = 'https://bmclapi2.bangbang93.com';
export const META_URL = `${BMCLAPI_BASE}/mc/game/version_manifest_v2.json`;

export const PLATFORM = getPlatform();
export const ARCH = getArch();

function getPlatform() {
  const p = platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'osx';
  if (p === 'linux') return 'linux';
  return p;
}

function getArch() {
  const a = arch();
  if (a === 'x64') return 'x86_64';
  if (a === 'arm64') return 'aarch_64' || 'arm64';
  return a;
}

export function toBMCLAPI(url) {
  if (!url) return url;
  return url
    .replace('https://piston-meta.mojang.com/', `${BMCLAPI_BASE}/`)
    .replace('https://piston-data.mojang.com/', `${BMCLAPI_BASE}/`)
    .replace('https://libraries.minecraft.net/', `${BMCLAPI_BASE}/maven/`)
    .replace('https://resources.download.minecraft.net/', `${BMCLAPI_BASE}/assets/`);
}

export function getMinecraftDir() {
  const home = app.getPath('home');
  if (PLATFORM === 'windows') {
    return path.join(process.env.APPDATA || home, 'fastlauncher');
  }
  return path.join(home, 'Library', 'Application Support', 'fastlauncher', 'version', '1.21.1');
}

export async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

export async function verifySHA1(filePath, expectedSha1) {
  if (!expectedSha1) return true;
  try {
    const hash = crypto.createHash('sha1');
    const data = await fs.readFile(filePath);
    hash.update(data);
    const actualSha1 = hash.digest('hex');
    return actualSha1 === expectedSha1.toLowerCase();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getOSNativesKey() {
  const keys = {
    'osx': PLATFORM === 'osx' ? (ARCH === 'aarch_64' ? 'natives-macos-arm64' : 'natives-macos') : null,
    'windows': PLATFORM === 'windows' ? (ARCH === 'aarch_64' ? 'natives-windows-arm64' : ARCH === 'x86_64' ? 'natives-windows' : 'natives-windows-x86') : null,
    'linux': PLATFORM === 'linux' ? (ARCH === 'aarch_64' ? 'natives-linux-arm64' : 'natives-linux') : null,
  };
  return keys[PLATFORM];
}

export function getGameArgs(gameArgs, profile) {
  const replacements = {
    '${auth_player_name}': profile.username,
    '${version_name}': '1.21.1',
    '${game_directory}': getMinecraftDir(),
    '${assets_root}': path.join(getMinecraftDir(), 'assets'),
    '${assets_index_name}': '17',
    '${auth_uuid}': profile.uuid,
    '${auth_access_token}': profile.accessToken,
    '${clientid}': profile.clientId,
    '${auth_xuid}': '',
    '${user_type}': profile.userType,
    '${version_type}': 'release',
    '${resolution_width}': '854',
    '${resolution_height}': '480',
    '${quickPlayPath}': '',
    '${quickPlaySingleplayer}': '',
    '${quickPlayMultiplayer}': '',
    '${quickPlayRealms}': '',
  };

  return gameArgs.map(arg => {
    if (typeof arg === 'string') {
      let result = arg;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
      }
      return result;
    }
    return arg;
  });
}

export function getJVMArgs(jvmArgs) {
  const nativeDir = path.join(getMinecraftDir(), 'natives', '1.21.1');
  const replacements = {
    '${natives_directory}': nativeDir,
    '${launcher_name}': 'fastlauncher',
    '${launcher_version}': '1.0.0',
  };

  return jvmArgs.map(arg => {
    if (typeof arg === 'string') {
      let result = arg;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
      }
      return result;
    }
    if (Array.isArray(arg)) {
      return arg.map(a => {
        if (typeof a === 'string') {
          let result = a;
          for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(key, value);
          }
          return result;
        }
        return a;
      });
    }
    return arg;
  }).flat();
}

export function filterByOS(rules) {
  if (!rules) return true;
  
  let allowed = true;
  
  for (const rule of rules) {
    if (rule.action === 'allow') {
      if (!rule.os) continue;
      if (rule.os.name && rule.os.name !== PLATFORM) {
        allowed = false;
      }
      if (rule.os.arch && rule.os.arch !== ARCH) {
        allowed = false;
      }
    } else if (rule.action === 'disallow') {
      if (!rule.os) continue;
      if (rule.os.name && rule.os.name === PLATFORM) {
        allowed = false;
      }
      if (rule.os.arch && rule.os.arch === ARCH) {
        allowed = false;
      }
    }
  }
  
  return allowed;
}
