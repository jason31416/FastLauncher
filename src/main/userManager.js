import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { createHash, randomUUID } from 'crypto';
import { ensureDir } from './utils.js';

const PROFILES_FILE = 'launcher_profiles.json';

function createUUID(username) {
  const hash = createHash('md5').update(username).digest('hex');
  return hash.substring(0, 8) + '-' + 
         hash.substring(8, 12) + '-' + 
         hash.substring(12, 16) + '-' + 
         hash.substring(16, 20) + '-' + 
         hash.substring(20, 32);
}

function getProfilesPath() {
  return path.join(app.getPath('userData'), PROFILES_FILE);
}

export class UserManager {
  constructor() {
    this.profilesPath = getProfilesPath();
    this.profiles = [];
    this.lastUsedProfileId = null;
  }

  async load() {
    try {
      const data = await fs.readFile(this.profilesPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.profiles = parsed.profiles || [];
      this.lastUsedProfileId = parsed.lastUsedProfileId || null;
      console.log('[UserManager] Loaded', this.profiles.length, 'profiles');
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.log('[UserManager] No profiles file, starting fresh');
        this.profiles = [];
        this.lastUsedProfileId = null;
      } else {
        console.error('[UserManager] Error loading profiles:', e);
        this.profiles = [];
      }
    }
  }

  async save() {
    try {
      await ensureDir(app.getPath('userData'));
      const data = JSON.stringify({
        profiles: this.profiles,
        lastUsedProfileId: this.lastUsedProfileId
      }, null, 2);
      await fs.writeFile(this.profilesPath, data, 'utf-8');
      console.log('[UserManager] Saved', this.profiles.length, 'profiles');
    } catch (e) {
      console.error('[UserManager] Error saving profiles:', e);
    }
  }

  async createProfile(username) {
    const existing = this.profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (existing) {
      return existing;
    }

    const profile = {
      id: randomUUID(),
      username: username,
      uuid: createUUID(username),
      createdAt: Date.now()
    };
    // id: 内部管理ID，用于launcher删除/重命名等操作（随机生成，永不变）
    // uuid: Minecraft游戏UUID，离线模式下由用户名哈希生成（相同用户名→相同UUID）
    //       未来支持Microsoft账户时，会是Microsoft提供的真实UUID

    this.profiles.push(profile);
    this.lastUsedProfileId = profile.id;
    await this.save();
    return profile;
  }

  async deleteProfile(profileId) {
    const index = this.profiles.findIndex(p => p.id === profileId);
    if (index !== -1) {
      const deleted = this.profiles.splice(index, 1)[0];
      if (this.lastUsedProfileId === deleted.id) {
        this.lastUsedProfileId = this.profiles.length > 0 ? this.profiles[0].id : null;
      }
      await this.save();
      return true;
    }
    return false;
  }

  async selectProfile(username) {
    const profile = this.profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (profile) {
      this.lastUsedProfileId = profile.id;
      await this.save();
      return profile;
    }
    return null;
  }

  async renameProfile(profileId, newUsername) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (profile) {
      profile.username = newUsername;
      profile.uuid = createUUID(newUsername);
      await this.save();
      return profile;
    }
    return null;
  }

  getProfiles() {
    return [...this.profiles];
  }

  getLastUsedProfileId() {
    return this.lastUsedProfileId;
  }

  getLastUsedProfile() {
    return this.profiles.find(p => p.id === this.lastUsedProfileId) || null;
  }
}