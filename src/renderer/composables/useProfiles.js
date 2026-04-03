import { ref } from 'vue';
import { useLauncherStore } from '../stores/launcher.js';

/* global window */

export function useProfiles() {
  const store = useLauncherStore();
  const profiles = ref([]);
  const isCreatingProfile = ref(false);
  const newUsername = ref('');

  async function loadProfiles() {
    try {
      const result = await window.launcherAPI.getProfiles();
      profiles.value = result.profiles || [];
      if (result.lastUsedUsername && !store.username) {
        store.setUsername(result.lastUsedUsername);
      }
    } catch (e) {
      console.error('Failed to load profiles:', e);
    }
  }

  async function createProfile() {
    if (!newUsername.value.trim()) return;
    try {
      await window.launcherAPI.createProfile(newUsername.value.trim());
      store.setUsername(newUsername.value.trim());
      await loadProfiles();
      newUsername.value = '';
      isCreatingProfile.value = false;
    } catch (e) {
      console.error('Failed to create profile:', e);
    }
  }

  async function deleteProfile(profileId) {
    try {
      await window.launcherAPI.deleteProfile(profileId);
      await loadProfiles();
      if (profiles.value.length === 0) {
        store.setUsername('');
      }
    } catch (e) {
      console.error('Failed to delete profile:', e);
    }
  }

  async function selectProfile(profileUsername) {
    store.setUsername(profileUsername);
    await window.launcherAPI.selectProfile(profileUsername);
    await window.launcherAPI.startDownload(profileUsername);
  }

  async function startGame() {
    if (!store.username.trim()) return;
    await window.launcherAPI.createProfile(store.username.trim());
    await loadProfiles();
    await window.launcherAPI.startDownload(store.username);
  }

  async function cancelDownload() {
    await window.launcherAPI.cancelDownload();
    store.reset();
  }

  return {
    profiles,
    isCreatingProfile,
    newUsername,
    loadProfiles,
    createProfile,
    deleteProfile,
    selectProfile,
    startGame,
    cancelDownload,
  };
}
