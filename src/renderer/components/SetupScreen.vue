<script setup>
import { ref, onMounted } from 'vue';

const emit = defineEmits(['complete']);

const selectedPath = ref('');
const isSelecting = ref(false);
const error = ref('');
const defaultPath = ref('');

onMounted(async () => {
  const currentDir = await window.launcherAPI.getMinecraftDir();
  const pathParts = currentDir.split(/[/\\]/);
  pathParts.pop();
  defaultPath.value = pathParts.join('/');
  selectedPath.value = defaultPath.value;
});

async function selectDirectory() {
  isSelecting.value = true;
  error.value = '';
  try {
    const result = await window.launcherAPI.selectDirectory();
    if (result.success && result.path) {
      selectedPath.value = result.path;
    }
  } catch (e) {
    error.value = e.message || '选择目录失败';
  } finally {
    isSelecting.value = false;
  }
}

async function confirmAndContinue() {
  if (!selectedPath.value.trim()) {
    error.value = '请先选择游戏目录';
    return;
  }
  error.value = '';
  try {
    const result = await window.launcherAPI.saveSettings(selectedPath.value.trim());
    if (result.success) {
      emit('complete');
    } else {
      error.value = result.error || '保存设置失败';
    }
  } catch (e) {
    error.value = e.message || '保存设置失败';
  }
}
</script>

<template>
  <div class="setup-screen">
    <div class="setup-content">
      <div class="setup-header">
        <div class="logo-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#6366f1"/>
            <path d="M24 12L36 36H12L24 12Z" fill="white"/>
          </svg>
        </div>
        <h1 class="setup-title">欢迎使用 FastLauncher</h1>
        <p class="setup-subtitle">首次使用，请选择 Minecraft 游戏目录</p>
      </div>

      <div class="directory-section">
        <label class="directory-label">游戏目录</label>
        <div class="directory-picker">
          <div class="directory-input-wrapper">
            <input
              type="text"
              v-model="selectedPath"
              placeholder="点击下方按钮选择目录"
              class="directory-input"
              readonly
            />
            <svg class="directory-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M2 4.5C2 3.67157 2.67157 3 3.5 3H7.5L9 5H16.5C17.3284 5 18 5.67157 18 6.5V15.5C18 16.3284 17.3284 17 16.5 17H3.5C2.67157 17 2 16.3284 2 15.5V4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <button
            class="btn-select"
            @click="selectDirectory"
            :disabled="isSelecting"
          >
            <span v-if="isSelecting">选择中...</span>
            <span v-else>选择目录</span>
          </button>
        </div>
        <p class="directory-hint">选择你希望存储 Minecraft 游戏文件的文件夹</p>
      </div>

      <div class="error-section" v-if="error">
        <p class="error-message">{{ error }}</p>
      </div>

      <div class="actions">
        <button
          class="btn-confirm"
          @click="confirmAndContinue"
          :disabled="!selectedPath.trim() || isSelecting"
        >
          开始使用
        </button>
      </div>

      <div class="default-path-hint">
        <p>默认目录: <code>{{ defaultPath }}</code></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.setup-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

.setup-header {
  text-align: center;
  margin-bottom: 36px;
}

.logo-icon {
  margin-bottom: 16px;
}

.setup-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.setup-subtitle {
  font-size: 14px;
  color: var(--text-tertiary);
}

.directory-section {
  width: 100%;
  margin-bottom: 24px;
}

.directory-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-align: left;
}

.directory-picker {
  display: flex;
  gap: 8px;
}

.directory-input-wrapper {
  flex: 1;
  position: relative;
}

.directory-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
}

.directory-input {
  width: 100%;
  padding: 12px 12px 12px 40px;
  font-size: 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.directory-input:focus {
  border-color: var(--accent);
}

.directory-input::placeholder {
  color: var(--text-tertiary);
}

.btn-select {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-select:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.directory-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 8px;
  text-align: left;
}

.error-section {
  width: 100%;
  margin-bottom: 16px;
}

.error-message {
  font-size: 13px;
  color: var(--error);
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  padding: 10px 12px;
  text-align: left;
}

.actions {
  width: 100%;
  margin-bottom: 20px;
}

.btn-confirm {
  width: 100%;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-confirm:disabled {
  background: var(--text-tertiary);
  cursor: not-allowed;
}

.default-path-hint {
  text-align: center;
}

.default-path-hint p {
  font-size: 12px;
  color: var(--text-tertiary);
}

.default-path-hint code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
}
</style>