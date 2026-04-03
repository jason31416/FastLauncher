# FastLauncher Codebase Guide

## Project Overview

Electron-based Minecraft launcher using Vue 3, Vite, Pinia, and Tailwind CSS v4.

**Tech Stack:** Electron 41.1.0 | Vue 3.5.31 (Composition API) | Pinia 3.0.4 | Vite 5.4.21 | Tailwind CSS 4.2.2 | adm-zip

---

## Build/Lint/Test Commands

```bash
npm start        # Development mode (Electron + Vite dev servers)
npm run package  # Package app as unsigned .app
npm run make     # Create distributable installer
npm run publish  # Publish to GitHub Releases
npm run lint     # Run ESLint (eslint src --ext .js,.vue)
```

**No test framework configured.** No way to run a single test.

---

## Directory Structure

```
src/
├── main.js              # Electron main process entry, IPC handlers
├── preload.js           # IPC bridge (contextBridge)
├── renderer.js          # Vue app entry point
├── index.css            # Global styles + Tailwind
├── main/
│   ├── downloader.js    # DownloadManager class, caching utilities
│   ├── downloaders/     # Modular download system
│   │   ├── index.js     # Public API exports
│   │   ├── queue.js     # Shared DownloadManager singleton
│   │   ├── vanilla.js   # Vanilla Minecraft download module
│   │   └── fabric.js    # Fabric modloader download module
│   ├── launcher.js      # GameLauncher class, JVM args, native extraction
│   ├── fabric.js        # Fabric integration (mainClass, classpath)
│   ├── javaManager.js   # Java download/installation
│   ├── installStatus.js # Installation status tracking
│   ├── settings.js      # Settings persistence
│   ├── userManager.js   # Profile management
│   ├── utils.js         # Utilities, path helpers, platform detection
│   └── adapt.js         # Pack installation adapter
└── renderer/
    ├── App.vue           # Main Vue component
    ├── components/       # Vue components (SetupScreen.vue, TitleBar.vue)
    ├── stores/           # Pinia stores (launcher.js)
    └── views/            # Vue views
```

---

## Code Style

### General Rules
- **ES Modules**: `import`/`export` only (no CommonJS `require`)
- **No semicolons**: ASI-based formatting
- **Indentation**: 2 spaces | **Line endings**: LF
- **Comments**: Do NOT add comments unless explicitly requested
- **Error handling**: Always use try/catch for async operations

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Variables/functions | `camelCase` | `downloadVersion`, `isRunning` |
| Classes | `PascalCase` | `DownloadManager`, `GameLauncher` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_DELAY`, `FABRIC_API_BASE` |
| Private methods | prefix with `_` | `_worker()`, `_downloadFile()` |

### Imports
```javascript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { GameLauncher } from './main/launcher.js';
import { vanilla, fabric, getVersionInfo, getVersionJson, buildFabricVersionJson, awaitProcess, getManager, addItem, cancel, onProgress } from './main/downloaders/index.js';
```
- Always include `.js` extension in relative imports
- Use `node:` prefix for Node.js built-ins

### Async/Await & Error Handling
```javascript
ipcMain.handle('channel-name', async (event, { param }) => {
  try {
    return { success: true, data: await someAsyncOp(param) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

console.error('[PREFIX] Error message');  // Always use [PREFIX] format
```

### Vue Components
```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
const store = useLauncherStore();
</script>
```
- Always use `<script setup>` (Composition API)
- Single-word component names allowed (`vue/multi-word-component-names` is off)

### Pinia Store
```javascript
export const useLauncherStore = defineStore('launcher', () => {
  const state = ref('idle');
  const isDownloading = computed(() => state.value === 'downloading');
  return { state, isDownloading };
});
```
- Use setup syntax (function form), not options syntax

### IPC Communication
- Main → Renderer: `mainWindow.webContents.send(channel, data)`
- Renderer → Main: `window.launcherAPI.someAction().then(handleResult)`
- IPC handlers return `{ success: true/false, data/error }`
- Preload exposes two namespaces: `window.launcherAPI` and `window.controlAPI`

---

## ESLint Configuration

Flat config format (`eslint.config.js`):
- `no-unused-vars`: warn (args starting with `_` ignored)
- `no-empty`: off
- Vue: `vue/no-v-html`: warn, `vue/require-explicit-emits`: warn, `vue/require-default-prop`: off
- Ignores: `node_modules/`, `dist/`, `out/`, `.vite/`

---

## Important Patterns

### File Paths — always use `path.join()`
```javascript
path.join(getMinecraftDir(), 'versions', versionId);
```

### Window Existence Check before IPC send
```javascript
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send(channel, data);
}
```

### Thread-Safe Queue (mutex pattern)
```javascript
async withMutex(fn) {
  while (this._mutex) { await sleep(10); }
  this._mutex = true;
  try { return await fn(); }
  finally { this._mutex = false; }
}
```

### Platform Detection
```javascript
import { platform, arch } from 'os';
// platform(): 'darwin' | 'linux' | 'win32'
// arch(): 'x64' | 'arm64' | 'aarch_64'
```

---

## Caching & Dev Notes

- Cached in `app.getPath('userData')/cache/`: version JSONs (permanent), asset indexes (permanent), `asset.json` (SHA1→path). Manifest fetched each time, skipped if version JSON cached.
- Context isolation enabled, nodeIntegration disabled. All Node.js ops in main process only.
- Vite configs: `vite.main.config.mjs`, `vite.preload.config.mjs`, `vite.renderer.config.mjs`
- Uses `@electron-forge/plugin-vite`
