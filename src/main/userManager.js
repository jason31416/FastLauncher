import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { getMinecraftDir, ensureDir } from './utils.js';

const PROFILES_FILE = 'launcher_profiles.json';

function createUUID(username) {
  const hash = createHash('md5').update(username).digest('hex');
  return hash.substring(0, 8) + '-' + 
         hash.substring(8, 12) + '-' + 
         hash.substring(12, 16) + '-' + 
         hash.substring(16, 20) + '-' + 
         hash.substring(20, 32);
}

export class UserManager {
  constructor() {
    this.profilesPath = path.join(getMinecraftDir(), PROFILES_FILE);
    this.profiles = [];
    this.lastUsedUsername = null;
  }

  async load() {
    try {
      const data = await fs.readFile(this.profilesPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.profiles = parsed.profiles || [];
      this.lastUsedUsername = parsed.lastUsedUsername || null;
      console.log('[UserManager] Loaded', this.profiles.length, 'profiles');
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.log('[UserManager] No profiles file, starting fresh');
        this.profiles = [];
        this.lastUsedUsername = null;
      } else {
        console.error('[UserManager] Error loading profiles:', e);
        this.profiles = [];
      }
    }
  }

  async save() {
    try {
      await ensureDir(getMinecraftDir());
      const data = JSON.stringify({
        profiles: this.profiles,
        lastUsedUsername: this.lastUsedUsername
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

    this.profiles.push(profile);
    this.lastUsedUsername = username;
    await this.save();
    return profile;
  }

  async deleteProfile(profileId) {
    const index = this.profiles.findIndex(p => p.id === profileId);
    if (index !== -1) {
      const deleted = this.profiles.splice(index, 1)[0];
      if (this.lastUsedUsername === deleted.username) {
        this.lastUsedUsername = this.profiles.length > 0 ? this.profiles[0].username : null;
      }
      await this.save();
      return true;
    }
    return false;
  }

  async selectProfile(username) {
    const profile = this.profiles.find(p => p.username.toLowerCase() === username.toLowerCase());
    if (profile) {
      this.lastUsedUsername = username;
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
      if (this.lastUsedUsername === profile.username) {
        this.lastUsedUsername = newUsername;
      }
      await this.save();
      return profile;
    }
    return null;
  }

  getProfiles() {
    return [...this.profiles];
  }

  getLastUsedUsername() {
    return this.lastUsedUsername;
  }

  getLastUsedProfile() {
    if (!this.lastUsedUsername) return null;
    return this.profiles.find(p => p.username === this.lastUsedUsername) || null;
  }
}