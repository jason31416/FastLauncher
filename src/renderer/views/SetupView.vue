<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useLauncherStore } from '../stores/launcher.js';

const router = useRouter();
const store = useLauncherStore();

const currentStep = ref(0);
const previousStep = ref(0);
const directoryPath = ref('');
const username = ref('');
const isLoading = ref(false);
const error = ref('');
const isVisible = ref(false);

onMounted(async () => {
  directoryPath.value = await window.launcherAPI.getDefaultMinecraftDir();
  setTimeout(() => {
    isVisible.value = true;
  }, 50);
});

const transitionName = computed(() => {
  if (currentStep.value === 0) return 'fade';
  if (previousStep.value > currentStep.value) return 'slide-right';
  return 'slide-left';
});

function goToStep1() {
  previousStep.value = currentStep.value;
  currentStep.value = 1;
}

async function handleSelectDirectory() {
  const result = await window.launcherAPI.selectDirectory();
  if (result.success) {
    directoryPath.value = result.path;
  }
}

async function handleContinueSubmit() {
  if (!directoryPath.value.trim()) {
    error.value = '请输入游戏目录';
    return;
  }
  isLoading.value = true;
  error.value = '';
  try {
    await window.launcherAPI.saveSettings(directoryPath.value.trim());
    previousStep.value = currentStep.value;
    currentStep.value = 2;
  } catch (e) {
    error.value = e.message || '保存失败';
  } finally {
    isLoading.value = false;
  }
}

function goBack() {
  previousStep.value = currentStep.value;
  currentStep.value = 1;
  error.value = '';
}

async function handleCreateAccount() {
  if (!username.value.trim()) {
    error.value = '请输入用户名';
    return;
  }
  isLoading.value = true;
  error.value = '';
  try {
    await window.launcherAPI.createProfile(username.value.trim());
    store.setUsername(username.value.trim());
    router.push('/');
  } catch (e) {
    error.value = e.message || '创建失败';
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-[400px] mx-auto p-8 flex flex-col h-full" :class="{ 'opacity-0': !isVisible, 'opacity-100': isVisible }" style="transition: opacity 0.5s ease;">
    <div class="flex-1 flex flex-col relative">
      <button
          v-if="currentStep === 2"
          @click="goBack"
          class="absolute top-0 left-0 p-2 text-gray-400 hover:text-gray-600 transition-colors z-10"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="flex-1 flex flex-col justify-center">
        <Transition :name="transitionName" mode="out-in">
          <div v-if="currentStep === 0" key="step0" class="text-center">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">FastLauncher</h1>
            <p class="text-sm text-gray-400 mb-12">Minecraft 启动器</p>
            <button
                @click="goToStep1"
                class="px-8 py-3 text-sm font-medium bg-blue-400 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              开始使用
            </button>
          </div>

          <div v-else-if="currentStep === 1" key="step1">
            <h1 class="text-xl font-semibold text-gray-900 mb-8 text-center">选择游戏目录</h1>
            <div class="space-y-4">
              <input
                  v-model="directoryPath"
                  class="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:border-blue-400 transition-colors"
                  placeholder="输入游戏目录路径"
              />
              <button
                  @click="handleSelectDirectory"
                  class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                选择其他目录
              </button>
            </div>
            <p v-if="error" class="text-sm text-red-400 mt-4 text-center">{{ error }}</p>
            <button
                @click="handleContinueSubmit"
                :disabled="isLoading"
                class="w-full py-3 mt-6 text-sm font-medium bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {{ isLoading ? '请稍候...' : '继续' }}
            </button>
          </div>

          <div v-else key="step2">
            <h1 class="text-xl font-semibold text-gray-900 mb-8 text-center">创建账号</h1>
            <div class="space-y-4">
              <input
                  v-model="username"
                  @keyup.enter="handleCreateAccount"
                  class="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 outline-none focus:border-blue-400 transition-colors"
                  placeholder="输入用户名"
                  autofocus
              />
            </div>
            <p v-if="error" class="text-sm text-red-400 mt-4 text-center">{{ error }}</p>
            <button
                @click="handleCreateAccount"
                :disabled="isLoading"
                class="w-full py-3 mt-6 text-sm font-medium bg-blue-400 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {{ isLoading ? '请稍候...' : '创建账号' }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-50px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(50px);
}
</style>
