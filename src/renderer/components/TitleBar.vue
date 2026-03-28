<script setup>
function minimize() {
  window.controlAPI?.minimize();
}

function close() {
  window.controlAPI?.close();
}
</script>

<template>
  <div class="title-bar">
    <div class="title-bar-drag">
      <span class="app-name">FastLauncher</span>
    </div>
    <div class="window-controls">
      <button class="control-btn minimize" @click="minimize" title="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="5.5" width="8" height="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="control-btn close" @click="close" title="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 38px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  -webkit-app-region: drag;
  user-select: none;
}

.title-bar-drag {
  flex: 1;
  display: flex;
  align-items: center;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  letter-spacing: 0.02em;
}

.window-controls {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.control-btn.close:hover {
  background: #fee2e2;
  color: #dc2626;
}
</style>
