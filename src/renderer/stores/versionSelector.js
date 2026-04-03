import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/* global window */

export const useVersionSelectorStore = defineStore('versionSelector', () => {
  const versions = ref([]);
  const selectedVersionId = ref(null);
  const versionDetails = ref(null);
  const isLoadingVersions = ref(false);
  const isLoadingDetails = ref(false);
  const error = ref(null);

  const selectedVersion = computed(() => {
    return versions.value.find(v => v.id === selectedVersionId.value) || null;
  });

  const hasVersions = computed(() => versions.value.length > 0);

  async function fetchInstalledVersions() {
    isLoadingVersions.value = true;
    error.value = null;
    try {
      const result = await window.launcherAPI.getInstalledVersions();
      if (result.success) {
        versions.value = result.versions;
      } else {
        error.value = result.error;
        versions.value = [];
      }
    } catch (e) {
      error.value = e.message;
      versions.value = [];
    } finally {
      isLoadingVersions.value = false;
    }
  }

  async function selectVersion(versionId) {
    if (selectedVersionId.value === versionId) return;
    
    selectedVersionId.value = versionId;
    versionDetails.value = null;
    await fetchVersionDetails(versionId);
  }

  async function fetchVersionDetails(versionId) {
    isLoadingDetails.value = true;
    error.value = null;
    try {
      const result = await window.launcherAPI.getVersionDetails(versionId);
      if (result.success) {
        versionDetails.value = result.details;
      } else {
        error.value = result.error;
        versionDetails.value = null;
      }
    } catch (e) {
      error.value = e.message;
      versionDetails.value = null;
    } finally {
      isLoadingDetails.value = false;
    }
  }

  function reset() {
    versions.value = [];
    selectedVersionId.value = null;
    versionDetails.value = null;
    isLoadingVersions.value = false;
    isLoadingDetails.value = false;
    error.value = null;
  }

  return {
    versions,
    selectedVersionId,
    versionDetails,
    isLoadingVersions,
    isLoadingDetails,
    error,
    selectedVersion,
    hasVersions,
    fetchInstalledVersions,
    selectVersion,
    fetchVersionDetails,
    reset
  };
});
