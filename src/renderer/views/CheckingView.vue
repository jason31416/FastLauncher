<script setup>
import { useLauncherStore } from '../stores/launcher.js';

const store = useLauncherStore();
</script>

<template>
  <div class="w-full max-w-[640px] mx-auto p-8 text-center">
    <div class="w-11 h-11 border-3 border-gray-200 border-t-blue-400 rounded-full mx-auto mb-5 animate-spin"></div>
    <p class="text-base font-semibold text-gray-900 mb-2">{{ store.message }}</p>
    <p class="text-sm text-gray-400">正在检查版本信息...</p>
  </div>
</template>
