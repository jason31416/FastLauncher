<script setup>
import { useLauncherStore } from '../stores/launcher.js';

const store = useLauncherStore();

async function cancelDownload() {
  await window.launcherAPI.cancelDownload();
  store.reset();
}
</script>

<template>
  <div class="w-full max-w-[640px] mx-auto p-8 text-left">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-base font-semibold text-gray-900">{{ store.message || (!store.completenessFlag ? '正在下载' : '检查文件完整性') }}</h2>
      <span class="text-xs font-medium text-blue-400 bg-blue-50 px-2.5 py-1 rounded-full">{{ store.versionInfo?.id || 'unknown' }}</span>
    </div>

    <div class="mb-4">
      <div class="h-2 bg-gray-100 rounded overflow-hidden mb-2.5">
        <div class="h-full bg-gradient-to-r from-blue-400 to-blue-300 rounded transition-all duration-300" :style="{ width: store.progressPercent + '%' }"></div>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-xl font-bold text-blue-400">{{ store.progressPercent }}%</span>
        <span class="text-sm text-gray-400">{{ store.downloadedMB }} / {{ parseFloat(store.totalMB) }} MB</span>
      </div>
    </div>

    <div class="p-3 bg-gray-50 rounded mb-4 text-xs flex gap-2" v-if="store.currentFile">
      <span class="text-gray-400 flex-shrink-0">当前文件:</span>
      <span class="text-gray-600 font-mono break-all">{{ store.currentFile }}</span>
    </div>

    <div class="mb-4">
      <div class="w-full h-[200px] overflow-y-auto border border-gray-200 rounded-lg bg-white">
        <div
            v-for="(worker, index) in store.workerStatus"
            :key="index"
            class="flex gap-2 p-1.5 text-xs font-mono border-b border-gray-100 last:border-b-0"
            :class="{ 'bg-blue-50': worker.fileId }"
        >
          <span class="text-gray-400 font-medium flex-shrink-0">#{{ index }}</span>
          <span class="text-gray-600 truncate">{{ worker.fileId || '-' }}</span>
        </div>
      </div>
    </div>

    <div class="flex justify-center" v-if="!store.completenessFlag">
      <button @click="cancelDownload" class="px-5 py-2.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-400 hover:bg-red-50 transition-all">
        取消
      </button>
    </div>
  </div>
</template>
