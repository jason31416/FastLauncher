<script setup>
import { useLauncherStore } from '../stores/launcher.js';

const store = useLauncherStore();

function handleRetry() {
  store.reset();
  window.location.hash = '#/';
}
</script>

<template>
  <div class="w-full max-w-[640px] mx-auto p-8 text-center">
    <div class="mb-5">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="32" fill="#fee2e2"/>
        <path d="M32 20V34M32 40V42" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>
      </svg>
    </div>
    <h2 class="text-xl font-semibold text-red-400 mb-3">发生错误</h2>
    <p class="text-sm text-gray-600 mb-6 p-3 bg-red-50 rounded-lg border border-red-100 text-left break-all">{{ store.error || store.message }}</p>
    <button @click="handleRetry" class="px-6 py-3 text-sm font-semibold rounded-lg bg-red-400 text-white hover:bg-red-500 transition-colors">
      重试
    </button>
  </div>
</template>
