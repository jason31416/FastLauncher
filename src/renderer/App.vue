<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useLauncherStore } from './stores/launcher.js';
import TitleBar from './components/TitleBar.vue';

const store = useLauncherStore();
const username = ref('');
const profiles = ref([]);
const lastUsedUsername = ref('');
const isCreatingProfile = ref(false);
const newUsername = ref('');

let unsubscribers = [];

onMounted(async () => {
  const api = window.launcherAPI;

  if (!api) {
    console.error('launcherAPI not found on window');
    return;
  }

  await loadProfiles();

  unsubscribers.push(
      api.onStateChange((data) => {
        store.setState(data.state, data.message);
        if (data.profile) {
          store.setProfile(data.profile);
        }
      })
  );

  unsubscribers.push(
      api.onVersionInfo((data) => {
        store.setVersionInfo(data);
      })
  );

  unsubscribers.push(
      api.onDownloadProgress((data) => {
        store.updateProgress(data);
      })
  );

  unsubscribers.push(
      api.onFileStart((data) => {
        store.setCurrentFile(data.path);
        store.updateWorkerStatus(data.workerId, { id: data.id, path: data.path });
      })
  );

  unsubscribers.push(
      api.onFileEnd((data) => {
        store.clearWorkerStatus(data.workerId);
      })
  );

  unsubscribers.push(
      api.onDownloadRetry((data) => {
        store.setRetryInfo(data);
      })
  );

  unsubscribers.push(
      api.onLauncherError((data) => {
        store.setError(data.error);
      })
  );

  unsubscribers.push(
      api.onCompletenessChange((data) => {
        store.setCompleteness(data.completeness);
      })
  );
});

async function loadProfiles() {
  try {
    const result = await window.launcherAPI.getProfiles();
    profiles.value = result.profiles || [];
    lastUsedUsername.value = result.lastUsedUsername || '';
    if (lastUsedUsername.value && !username.value) {
      username.value = lastUsedUsername.value;
    }
  } catch (e) {
    console.error('Failed to load profiles:', e);
  }
}

async function createProfile() {
  if (!newUsername.value.trim()) return;
  try {
    await window.launcherAPI.createProfile(newUsername.value.trim());
    await loadProfiles();
    username.value = newUsername.value.trim();
    newUsername.value = '';
    isCreatingProfile.value = false;
  } catch (e) {
    console.error('Failed to create profile:', e);
  }
}

async function deleteProfile(profileId) {
  try {
    await window.launcherAPI.deleteProfile(profileId);
    await loadProfiles();
    if (profiles.value.length === 0) {
      username.value = '';
    }
  } catch (e) {
    console.error('Failed to delete profile:', e);
  }
}

function selectProfile(profileUsername) {
  username.value = profileUsername;
  window.launcherAPI.selectProfile(profileUsername);
}

onUnmounted(() => {
  unsubscribers.forEach(unsub => unsub());
});

async function startGame() {
  if (!username.value.trim()) return;
  store.username = username.value;
  await window.launcherAPI.startDownload(username.value);
}

async function launchGame() {
  await window.launcherAPI.launchGame(store.username || username.value);
}

async function cancelDownload() {
  await window.launcherAPI.cancelDownload();
  store.reset();
}
</script>

<template>
  <div class="app">
    <TitleBar />

    <main class="main-content">

      <template v-if="store.state === 'idle'">
        <div class="idle-view">
          <h1 class="title">FastLauncher</h1>
          <p class="subtitle">选择玩家档案开始游戏</p>

          <div class="profile-section" v-if="profiles.length > 0 && !isCreatingProfile">
            <div class="profile-list">
              <div
                  v-for="profile in profiles"
                  :key="profile.id"
                  class="profile-item"
                  :class="{ selected: username === profile.username }"
                  @click="selectProfile(profile.username)"
              >
                <div class="profile-avatar">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#e0e7ff"/>
                    <path d="M16 8L22 24H10L16 8Z" fill="#6366f1"/>
                  </svg>
                </div>
                <div class="profile-info">
                  <span class="profile-name">{{ profile.username }}</span>
                  <span class="profile-tag" v-if="lastUsedUsername === profile.username">上次使用</span>
                </div>
                <button class="profile-delete" @click.stop="deleteProfile(profile.id)">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <button class="btn-outline btn-small" @click="isCreatingProfile = true">
              添加新档案
            </button>
          </div>

          <div class="input-section" v-else-if="!isCreatingProfile">
            <input
                v-model="username"
                placeholder="输入用户名"
                @keyup.enter="startGame"
                class="username-input"
            />
            <button
                @click="startGame"
                :disabled="!username.trim()"
                class="btn-primary"
            >
              开始
            </button>
          </div>

          <div class="create-profile-section" v-else>
            <input
                v-model="newUsername"
                placeholder="输入新用户名"
                @keyup.enter="createProfile"
                class="username-input"
                autofocus
            />
            <div class="create-actions">
              <button class="btn-outline btn-small" @click="isCreatingProfile = false; newUsername = ''">
                取消
              </button>
              <button
                  class="btn-primary btn-small"
                  @click="createProfile"
                  :disabled="!newUsername.trim()"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="store.state === 'checking'">
        <div class="status-view">
          <div class="spinner"></div>
          <p class="status-message">{{ store.message }}</p>
          <p class="status-hint">正在检查版本信息...</p>
        </div>
      </template>

      <template v-else-if="store.state === 'downloading'">
        <div class="download-view">
          <div class="download-header">
            <h2 v-if="!store.completenessFlag">正在下载</h2>
            <h2 v-else>检查文件完整性</h2>

            <span class="version-tag">{{ store.versionInfo?.id || '1.21.1' }}</span>
          </div>

          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: store.progressPercent + '%' }"></div>
            </div>
            <div class="progress-info">
              <span class="progress-percent">{{ store.progressPercent }}%</span>
              <span class="progress-size" v-if="!store.completenessFlag">{{ store.downloadedMB }} / {{ store.totalMB }} MB</span>
            </div>
          </div>

          <div class="current-file" v-if="store.currentFile">
            <span class="file-label">当前文件:</span>
            <span class="file-name">{{ store.currentFile }}</span>
          </div>

          <div class="worker-section" v-if="!store.completenessFlag">
            <div class="worker-list">
              <div
                  v-for="(worker, index) in store.workerStatus"
                  :key="index"
                  class="worker-item"
                  :class="{ 'active': worker.fileId }"
              >
                <span class="worker-id">#{{ index }}</span>
                <span class="worker-file">{{ worker.fileId || '-' }}</span>
              </div>
            </div>
          </div>

          <div class="download-actions" v-if="!store.completenessFlag">
            <button @click="cancelDownload" class="btn-outline">
              取消
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="store.state === 'extracting'">
        <div class="status-view">
          <div class="spinner"></div>
          <p class="status-message">{{ store.message }}</p>
          <p class="status-hint">正在解压游戏文件...</p>
        </div>
      </template>

      <template v-else-if="store.state === 'launching'">
        <div class="status-view">
          <div class="spinner"></div>
          <p class="status-message">{{ store.message }}</p>
          <p class="status-hint">正在启动游戏客户端...</p>
        </div>
      </template>

      <template v-else-if="store.state === 'playing'">
        <div class="status-view">
          <div class="success-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#d1fae5"/>
              <path d="M20 32L29 41L44 26" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="status-message">游戏已启动</p>
          <p class="status-hint">游戏窗口应该已经打开</p>
        </div>
      </template>

      <template v-else-if="store.state === 'error'">
        <div class="error-view">
          <div class="error-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#fee2e2"/>
              <path d="M32 20V34M32 40V42" stroke="#f87171" stroke-width="4" stroke-linecap="round"/>
            </svg>
          </div>
          <h2 class="error-title">发生错误</h2>
          <p class="error-message">{{ store.error || store.message }}</p>
          <button @click="store.reset()" class="btn-danger">
            重试
          </button>
        </div>
      </template>

    </main>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.idle-view,
.status-view,
.download-view,
.ready-view,
.error-view {
  width: 100%;
  max-width: 640px;
  padding: 32px;
  text-align: center;
}

.idle-view .logo-icon {
  margin-bottom: 20px;
}

.idle-view .title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.idle-view .subtitle {
  font-size: 14px;
  color: var(--text-tertiary);
  margin-bottom: 32px;
}

.input-section {
  display: flex;
  gap: 12px;
  max-width: 360px;
  margin: 0 auto;
}

.username-input {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.username-input:focus {
  border-color: var(--accent);
}

.username-input::placeholder {
  color: var(--text-tertiary);
}

.btn-primary {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  background: var(--text-tertiary);
  cursor: not-allowed;
}

.btn-primary.btn-large {
  padding: 14px 40px;
  font-size: 16px;
}

.btn-danger {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  background: var(--error);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #ef4444;
}

.btn-outline {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline:hover {
  border-color: var(--error);
  color: var(--error);
  background: #fef2f2;
}

.btn-small {
  padding: 8px 16px;
  font-size: 13px;
}

.profile-section {
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}

.profile-list {
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--border-light);
}

.profile-item:last-child {
  border-bottom: none;
}

.profile-item:hover {
  background: var(--bg-secondary);
}

.profile-item.selected {
  background: var(--accent-light);
}

.profile-avatar {
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.profile-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.profile-tag {
  font-size: 11px;
  color: var(--accent);
}

.profile-delete {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  opacity: 0;
}

.profile-item:hover .profile-delete {
  opacity: 1;
}

.profile-delete:hover {
  background: #fee2e2;
  color: var(--error);
}

.create-profile-section {
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}

.create-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.status-view .spinner {
  width: 44px;
  height: 44px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  margin: 0 auto 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-view .status-message {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.status-view .status-hint {
  font-size: 13px;
  color: var(--text-tertiary);
}

.download-view {
  text-align: left;
}

.download-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.download-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.version-tag {
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-light);
  padding: 4px 10px;
  border-radius: 12px;
}

.progress-section {
  margin-bottom: 16px;
}

.progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #93c5fd);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-percent {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}

.progress-size {
  font-size: 13px;
  color: var(--text-tertiary);
}

.current-file {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
  font-size: 12px;
  display: flex;
  gap: 8px;
}

.file-label {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.file-name {
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
  word-break: break-all;
}

.worker-section {
  margin-bottom: 16px;
}

.worker-list {
  width: 100%;
  height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
}

.worker-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  border-bottom: 1px solid var(--border-light);
}

.worker-item:last-child {
  border-bottom: none;
}

.worker-item.active {
  background: var(--accent-light);
}

.worker-id {
  color: var(--text-tertiary);
  font-weight: 500;
  flex-shrink: 0;
}

.worker-item.active .worker-id {
  color: var(--accent);
}

.worker-file {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-actions {
  display: flex;
  justify-content: center;
}

.status-view .success-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.ready-view .success-icon {
  margin-bottom: 20px;
}

.ready-view .ready-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 24px;
}

.info-list {
  margin-bottom: 28px;
  text-align: left;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  color: var(--text-tertiary);
  font-size: 14px;
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.error-view .error-icon {
  margin-bottom: 20px;
}

.error-view .error-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--error);
  margin-bottom: 12px;
}

.error-view .error-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  padding: 12px;
  background: #fef2f2;
  border-radius: var(--radius-md);
  border: 1px solid #fecaca;
  text-align: left;
  word-break: break-all;
}
</style>