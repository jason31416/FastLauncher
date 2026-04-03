<script setup>
import { useLauncherStore } from '../stores/launcher.js';

const store = useLauncherStore();
</script>

<template>
  <div class="w-full max-w-[640px] mx-auto p-8 text-center">
    <div class="w-11 h-11 border-3 border-gray-200 border-t-blue-400 rounded-full mx-auto mb-5 animate-spin"></div>
    <p class="text-base font-semibold text-gray-900 mb-2">{{ store.message }}</p>
    <p class="text-sm text-gray-400">正在下载并安装 Java...</p>
    <div class="w-[200px] mx-auto mt-4" v-if="store.javaDownloadProgress > 0">
      <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-blue-400 to-blue-300 rounded-full transition-all duration-300" :style="{ width: store.javaDownloadProgress + '%' }"></div>
      </div>
    </div>
  </div>
</template>
