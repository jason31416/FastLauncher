<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useLauncherStore } from './stores/launcher.js';
import TitleBar from './components/TitleBar.vue';

const store = useLauncherStore();
const username = ref('');

let unsubscribers = [];

onMounted(() => {
  const api = window.launcherAPI;
  
  if (!api) {
    console.error('launcherAPI not found on window');
    return;
  }
  
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
    api.onDownloadRetry((data) => {
      store.setRetryInfo(data);
    })
  );
  
  unsubscribers.push(
    api.onLauncherError((data) => {
      store.setError(data.error);
    })
  );
});

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
          <div class="logo-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect width="56" height="56" rx="14" fill="#dbeafe"/>
              <path d="M28 16L40 44H16L28 16Z" fill="#60a5fa" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1 class="title">Minecraft 1.21.1</h1>
          <p class="subtitle">输入用户名开始下载游戏</p>
          
          <div class="input-section">
            <input 
              v-model="username" 
              placeholder="用户名"
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
            <h2>正在下载</h2>
            <span class="version-tag">{{ store.versionInfo?.id || '1.21.1' }}</span>
          </div>
          
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: store.progressPercent + '%' }"></div>
            </div>
            <div class="progress-info">
              <span class="progress-percent">{{ store.progressPercent }}%</span>
              <span class="progress-size">{{ store.downloadedMB }} / {{ store.totalMB }} MB</span>
            </div>
          </div>
          
          <div class="current-file" v-if="store.currentFile">
            <span class="file-label">当前文件:</span>
            <span class="file-name">{{ store.currentFile }}</span>
          </div>
          
          <div class="worker-section">
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
          
          <div class="download-actions">
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
      
      <template v-else-if="store.state === 'ready'">
        <div class="ready-view">
          <div class="success-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#d1fae5"/>
              <path d="M20 32L29 41L44 26" stroke="#34d399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h2 class="ready-title">准备就绪</h2>
          
          <div class="info-list">
            <div class="info-item">
              <span class="info-label">版本</span>
              <span class="info-value">1.21.1</span>
            </div>
            <div class="info-item">
              <span class="info-label">用户名</span>
              <span class="info-value">{{ store.profile?.username || username }}</span>
            </div>
          </div>
          
          <button @click="launchGame" class="btn-primary btn-large">
            启动游戏
          </button>
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
