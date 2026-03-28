# FastLauncher Codebase Guide

## Project Overview

An Electron-based Minecraft launcher using Vue 3, Vite, Pinia, and Tailwind CSS v4.

**Tech Stack:**
- Electron 41.x (main process)
- Vue 3.5.x with Composition API (`<script setup>`)
- Pinia 3.x for state management
- Vite 5.x for bundling
- Tailwind CSS v4 for styling
- adm-zip for native extraction

**Directory Structure:**
```
src/
├── main.js              # Electron main process entry
├── preload.js           # IPC bridge (contextBridge)
├── renderer.js          # Vue app entry point
├── index.css            # Global styles + Tailwind
├── main/                # Main process modules
│   ├── downloader.js    # Download manager with concurrency
│   ├── launcher.js      # Game launch logic
│   ├── userManager.js   # Profile management
│   ├── utils.js        # Shared utilities
│   └── version.js       # Version management
└── renderer/            # Renderer process
    ├── App.vue          # Main Vue component
    ├── components/      # Vue components
    └── stores/          # Pinia stores
```

---

## Build/Lint/Test Commands

```bash
# Development
npm start                # Run app in development mode

# Production builds
npm run package         # Package app (creates unsigned .app)
npm run make            # Create distributable installer
npm run publish         # Publish to GitHub Releases

# Linting (currently not configured)
npm run lint            # Currently echoes "No linting configured"
```

**No test framework is currently configured.**

---

## Code Style Guidelines

### General

- **ES Modules**: Use `import`/`export` exclusively (no CommonJS `require`)
- **No semicolons**: Follow StandardJS-style ( ASI-based )
- **Indentation**: 2 spaces
- **Line endings**: LF

### JavaScript (Main/Renderer)

**Naming Conventions:**
- Variables/functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: prefix with `_`

**Imports:**
```javascript
// External packages
import { app, BrowserWindow, ipcMain } from 'electron';
import { createApp } from 'vue';
import path from 'node:path';

// Internal modules (use .js extension)
import { DownloadManager } from './main/downloader.js';
import { useLauncherStore } from './stores/launcher.js';
```

**Async/Await:**
```javascript
// Always wrap async operations in try/catch when calling from IPC handlers
async function startDownload(username) {
  try {
    // async operations
  } catch (error) {
    sendToRenderer('state-change', { state: 'error', message: error.message });
  }
}
```

**Error Handling:**
- Use `error.message` for user-facing messages
- Use `error.stack` for debugging (send to renderer when needed)
- Check error codes (e.g., `e.code === 'ENOENT'`)
- Use `console.error` with `[PREFIX]` format: `[DOWNLOAD FAILED]`, `[LAUNCHER]`, etc.

### Vue Components

**Script Setup:**
```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useLauncherStore } from './stores/launcher.js';
import TitleBar from './components/TitleBar.vue';

const store = useLauncherStore();
const username = ref('');

onMounted(async () => {
  // cleanup in onUnmounted
});
</script>
```

**Template:**
- Use `v-if`/`v-else-if`/`v-else` chain for mutually exclusive states
- Use Tailwind classes for all styling
- Prefer `flex` layout with `gap-*` utilities
- Use semantic HTML elements

### Tailwind CSS

**Class Ordering (suggested):**
1. Layout: `flex`, `grid`, `hidden`, `block`
2. Sizing: `w-*`, `h-*`, `max-w-*`
3. Spacing: `p-*`, `m-*`, `gap-*`
4. Typography: `text-*`, `font-*`
5. Colors: `bg-*`, `text-*`, `border-*`
6. Effects: `shadow-*`, `rounded-*`
7. Transitions: `transition-*`, `duration-*`
8. Interactive: `hover:*`, `focus:*`, `active:*`, `disabled:*`

**Breakpoints:**
- `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px)

### IPC Communication

**Pattern:**
```javascript
// Main process - sending
ipcMain.handle('channel-name', async (event, { param1, param2 }) => {
  try {
    const result = await someAsyncOperation(param1);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Renderer - receiving via preload API
const api = window.launcherAPI;
api.someAction(param1, param2).then(result => {
  if (result.success) {
    // handle success
  } else {
    // handle error
  }
});

// Renderer - listening to events
const unsubscribe = api.onStateChange((data) => {
  store.setState(data.state, data.message);
});
onUnmounted(() => unsubscribe());
```

**Preload API Exposed:**
- `window.launcherAPI` - Game/download operations
- `window.controlAPI` - Window controls (minimize, close)

### State Management (Pinia)

```javascript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useLauncherStore = defineStore('launcher', () => {
  const state = ref('idle');
  
  const isDownloading = computed(() => state.value === 'downloading');
  
  function setState(newState, newMessage) {
    state.value = newState;
    message.value = newMessage || '';
  }
  
  return { state, isDownloading, setState };
});
```

### EventEmitter Pattern

```javascript
import { EventEmitter } from 'events';

class DownloadManager extends EventEmitter {
  constructor() {
    super();
  }
  
  _emitProgress(status) {
    this.emit('progress', status);
  }
}

// Usage
downloadManager.on('progress', (status) => {
  sendToRenderer('download-progress', status);
});
```

---

## Development Notes

### Electron Main Process
- Context isolation enabled, nodeIntegration disabled
- All Node.js/file operations in main process only
- Use `app.quit()` on window-close unless on macOS (`process.platform !== 'darwin'`)

### Vite Configuration
- `vite.main.config.mjs` - Main process bundling
- `vite.preload.config.mjs` - Preload script bundling  
- `vite.renderer.config.mjs` - Vue app bundling with Tailwind

### Forge Configuration
- Entry points: `src/main.js` (main), `src/preload.js` (preload)
- Output: `.vite/build/`
- Uses `@electron-forge/plugin-vite`

### Platform Detection
```javascript
import { platform, arch } from 'os';
// platform(): 'darwin' | 'linux' | 'win32'
// arch(): 'x64' | 'arm64'
```

### File Paths
```javascript
import path from 'node:path';
// Always use path.join() for cross-platform paths
// getMinecraftDir() returns platform-specific minecraft directory
```

---

## Common Patterns

**Checking if window is destroyed:**
```javascript
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send(channel, data);
}
```

**Mutex pattern for thread-safe queue:**
```javascript
async withMutex(fn) {
  while (this._mutex) {
    await sleep(10);
  }
  this._mutex = true;
  try {
    return await fn();
  } finally {
    this._mutex = false;
  }
}
```

**Dynamic import for circular deps:**
```javascript
export async function downloadVersionManifest() {
  const { META_URL, toBMCLAPI } = await import('./utils.js');
  // ...
}
```
