<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useVersionSelectorStore } from '../stores/versionSelector.js';
import VersionSidebar from '../components/VersionSidebar.vue';
import VersionDetails from '../components/VersionDetails.vue';

const store = useVersionSelectorStore();

onMounted(async () => {
  await store.fetchInstalledVersions();
});

onUnmounted(() => {
  store.reset();
});

function handleVersionSelect(versionId) {
  store.selectVersion(versionId);
}
</script>

<template>
  <div class="flex h-full w-full items-stretch justify-start">
    <VersionSidebar
      :versions="store.versions"
      :selectedId="store.selectedVersionId"
      :isLoading="store.isLoadingVersions"
      @select="handleVersionSelect"
    />
    <VersionDetails
      :details="store.versionDetails"
      :isLoading="store.isLoadingDetails"
    />
  </div>
</template>
