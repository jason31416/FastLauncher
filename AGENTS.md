# FastLauncher Codebase Guide

## Project Overview

Electron-based Minecraft launcher using Vue 3, Vite, Pinia, and Tailwind CSS v4.

**Tech Stack:** Electron 41.x | Vue 3.5.x (Composition API) | Pinia 3.x | Vite 5.x | Tailwind CSS v4 | adm-zip

---

## Build/Lint/Test Commands

```bash
npm start        # Development mode (Electron + Vite dev servers)
npm run package  # Package app as unsigned .app
npm run make     # Create distributable installer
npm run publish  # Publish to GitHub Releases
npm run lint     # No linting configured (echo only)
```

**No test framework configured.**

---

## Directory Structure

```
src/
├── main.js              # Electron main process entry, IPC handlers
├── preload.js           # IPC bridge (contextBridge)
├── renderer.js          # Vue app entry point
├── index.css            # Global styles + Tailwind
├── main/
│   ├── constants.js     # MINECRAFT_VERSION, FABRIC_ENABLED toggles
│   ├── downloader.js    # DownloadManager class, caching utilities
│   ├── downloaders/     # Modular download system
│   │   ├── index.js    # Public API exports
│   │   ├── queue.js     # Shared DownloadManager singleton
│   │   ├── vanilla.js  # Vanilla Minecraft download module
│   │   ├── fabric.js   # Fabric modloader download module
│   │   └── example.js  # Reference download flow examples
│   ├── launcher.js     # GameLauncher class, JVM args, native extraction
│   ├── fabric.js        # Fabric integration (mainClass, classpath)
│   ├── javaManager.js  # Java download/installation
│   ├── settings.js      # Settings persistence
│   ├── userManager.js  # Profile management
│   ├── utils.js        # Utilities, path helpers, platform detection
│   └── version.js      # VersionManager class (legacy)
└── renderer/
    ├── App.vue          # Main Vue component
    ├── components/      # Vue components
    └── stores/          # Pinia stores
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
import { DownloadManager } from './main/downloader.js';
import { vanilla, fabric, awaitProcess } from './main/downloaders/index.js';
```

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

### Pinia Store
```javascript
export const useLauncherStore = defineStore('launcher', () => {
  const state = ref('idle');
  const isDownloading = computed(() => state.value === 'downloading');
  return { state, isDownloading };
});
```

### IPC Communication
- Main → Renderer: `mainWindow.webContents.send(channel, data)`
- Renderer → Main: `window.launcherAPI.someAction().then(handleResult)`
- IPC handlers return `{ success: true/false, data/error }`

---

## Modular Download System

### API (`src/main/downloaders/`)

```javascript
import { vanilla, fabric, awaitProcess, loadAssetCacheIndex } from './main/downloaders/index.js';

await vanilla.download('1.21.1');                    // Queue vanilla downloads (non-blocking)
await fabric.download('1.21.1:0.18.5');               // Queue fabric downloads (non-blocking)
await awaitProcess();                                 // Wait for all downloads to complete
```

### Event Wiring (in main.js)
```javascript
import { onProgress, onFileStart, onFileEnd, onRetry, onDownloadProgress, onComplete } from './main/downloaders/index.js';

onProgress((status) => sendToRenderer('download-progress', status));
onFileStart(({ workerId, id, path }) => sendToRenderer('file-start', { workerId, id, path }));
onComplete(() => sendToRenderer('state-change', { state: 'downloaded' }));
```

### Example Download Flow (`src/main/downloaders/example.js`)
```javascript
export async function downloadWithFabric(mcVersion, fabricVersion) {
  await loadAssetCacheIndex();
  await vanilla.download(mcVersion);
  await fabric.download(`${mcVersion}:${fabricVersion}`);
  await awaitProcess();
}
```

### Queue Management
```javascript
import { getManager, addItem, cancel } from './main/downloaders/index.js';

getManager().isRunning;     // Check if download is active
addItem({ id, path, url, sha1, size, type });  // Add item to queue
await cancel();             // Cancel ongoing download
```

---

## Important Patterns

### File Paths
```javascript
path.join(getMinecraftDir(), 'versions', versionId);  // Always use path.join()
```

### Window Check
```javascript
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send(channel, data);
}
```

### Thread-Safe Queue
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

## Caching Strategy

Cached in `app.getPath('userData')/cache/`:
- `versions/{versionId}.json` - version JSON (permanent)
- `assets/indexes/{assetIndexId}.json` - asset index (permanent)
- `asset.json` - asset SHA1 → path mapping

Manifest is **not** cached - fetched every time, but skipped if version JSON cache exists.

SHA1 verification: Files with `sha1: null` are re-downloaded if size is 0.

---

## Modloader Support

### Fabric Configuration (`src/main/constants.js`)
```javascript
export const MINECRAFT_VERSION = '26.1';
export const FABRIC_ENABLED = false;
```

### Adding a New Modloader (e.g., Forge)
1. Create `src/main/{modloader}.js` with version fetching and library building
2. Create `src/main/downloaders/{modloader}.js` for download module
3. Add `{MODLOADER}_ENABLED` and `{MODLOADER}_MC_VERSION` to constants.js
4. Export download function and build functions
5. Integrate in main.js download flow

---

## Development Notes

- Context isolation enabled, nodeIntegration disabled
- All Node.js/file operations in main process only
- Vite configs: `vite.main.config.mjs`, `vite.preload.config.mjs`, `vite.renderer.config.mjs`
- Uses `@electron-forge/plugin-vite`
