<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLauncherStore } from '../stores/launcher.js';
import { useProfiles } from '../composables/useProfiles.js';
import { Play, Settings } from 'lucide-vue-next';

const router = useRouter();
const store = useLauncherStore();
const { startGame } = useProfiles();

const displayedTextFixed = ref('');
const displayedTextName = ref('');
const isTyping = ref(false);
const WELCOME = '欢迎, ';

function goToProfiles() {
  router.push('/profiles');
}

function goToVersions() {
  router.push('/versions');
}

const displayVersion = () => {
  if (store.versionInfo?.id) {
    return store.versionInfo.id;
  }
  return '未选择版本';
};

function startTyping() {
  const targetUsername = store.username || '选择档案';
  const fullText = WELCOME + targetUsername;
  let charIndex = 0;
  displayedTextFixed.value = '';
  displayedTextName.value = '';
  isTyping.value = true;

  function typeNextChar() {
    if (charIndex < fullText.length) {
      if(charIndex < WELCOME.length) {
        displayedTextFixed.value += fullText[charIndex];
      } else {
        displayedTextName.value += fullText[charIndex];
      }
      charIndex++;
      setTimeout(typeNextChar, 80);
    } else {
      isTyping.value = false;
    }
  }

  typeNextChar();
}

onMounted(() => {
  console.log('[DEBUG HomeView] store.username:', store.username);
  console.log('[DEBUG HomeView] store.versionInfo:', store.versionInfo);
  startTyping();
});

watch(() => store.username, () => {
  if (!isTyping.value) {
    startTyping();
  }
});
</script>

<template>
  <div class="w-full mx-auto p-8 flex flex-col h-full">
    <div class="flex-1 flex flex-col items-center justify-center gap-5">
      <div class="mt-40 text-4xl font-[450] text-gray-800 flex">
        <span>{{ displayedTextFixed }}</span>
        <div
            @click="goToProfiles"
            class="ml-2 text-gray-900 hover:text-blue-500 transition-colors duration-400 ease-in-out decoration-2 underline underline-offset-2"
        >
          {{ displayedTextName }}
        </div>
        <span v-if="isTyping" class="animate-pulse">|</span>
      </div>

      <div class="mt-30 w-[200px] flex flex-col items-center gap-1">
        <button
            @click="startGame"
            :disabled="!store.username || !store.versionInfo?.id"
            class="w-full py-3 text-lg font-semibold bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-400 ease-in-out flex items-center justify-center gap-2"
        >
          <Play :size="16" />
          <span>启动游戏</span>
        </button>
        <span class="text-xs text-gray-500">{{ displayVersion() }}</span>
      </div>

      <button
          @click="goToVersions"
          class="mt-4 py-2 px-4 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
      >
        <Settings :size="14" />
        <span>版本管理</span>
      </button>
    </div>
  </div>
</template>
