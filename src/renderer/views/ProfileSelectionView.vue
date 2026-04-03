<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLauncherStore } from '../stores/launcher.js';
import { useProfiles } from '../composables/useProfiles.js';

const router = useRouter();
const store = useLauncherStore();
const { profiles, isCreatingProfile, newUsername, loadProfiles, createProfile, deleteProfile } = useProfiles();

onMounted(async () => {
  await loadProfiles();
});

async function handleSelectProfile(username) {
  store.setUsername(username);
  await window.launcherAPI.selectProfile(username);
  router.back();
}

async function handleCreateProfile() {
  await createProfile();
  if (!isCreatingProfile.value) {
    router.back();
  }
}

function handleBack() {
  router.back();
}
</script>

<template>
  <div class="w-full max-w-[400px] mx-auto p-8">
    <button @click="handleBack" class="mb-6 p-2 text-gray-400 hover:text-gray-600 transition-colors">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="flex justify-center w-full"><h1 class="text-xl font-bold text-gray-900 mb-8">选择档案</h1></div>

    <div class="space-y-3 mb-8">
      <div
          v-for="profile in profiles"
          :key="profile.id"
          class="w-full flex items-center gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <button
            @click="handleSelectProfile(profile.username)"
            class="flex items-center gap-3 flex-1 text-left"
        >
          <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-medium">
            {{ profile.username.charAt(0).toUpperCase() }}
          </div>
          <span class="text-gray-900">{{ profile.username }}</span>
        </button>
        <button
            @click.stop="deleteProfile(profile.id)"
            class="p-2 text-gray-400 hover:text-red-400 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div v-if="!isCreatingProfile">
      <button
          @click="isCreatingProfile = true"
          class="w-full py-3 text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
      >
        + 添加新档案
      </button>
    </div>

    <div v-else class="space-y-3">
      <input
          v-model="newUsername"
          placeholder="输入用户名"
          @keyup.enter="handleCreateProfile"
          class="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:border-blue-400 transition-colors"
          autofocus
      />
      <div class="flex gap-2">
        <button
            @click="isCreatingProfile = false; newUsername = ''"
            class="flex-1 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          取消
        </button>
        <button
            @click="handleCreateProfile"
            :disabled="!newUsername.trim()"
            class="flex-1 py-2 text-sm font-medium bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          创建
        </button>
      </div>
    </div>
  </div>
</template>
