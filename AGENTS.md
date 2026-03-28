# FastLauncher Codebase Guide

## Project Overview

Electron-based Minecraft launcher using Vue 3, Vite, Pinia, and Tailwind CSS v4.

**Tech Stack:**
- Electron 41.x | Vue 3.5.x (Composition API) | Pinia 3.x | Vite 5.x | Tailwind CSS v4 | adm-zip

**Directory Structure:**
```
src/
├── main.js              # Electron main process entry
├── preload.js           # IPC bridge (contextBridge)
├── renderer.js          # Vue app entry point
├── index.css            # Global styles + Tailwind
├── main/                # Main process modules
│   ├── downloader.js    # Download manager, caching logic, SHA1 verification
│   ├── launcher.js      # Game launch logic, classpath/JVM args building
│   ├── userManager.js   # Profile management
│   ├── utils.js         # Shared utilities, path helpers, platform detection
│   ├── version.js       # Version management, download list building
│   └── fabric.js        # Fabric modloader support
└── renderer/            # Renderer process (Vue)
    ├── App.vue          # Main Vue component
    ├── components/      # Vue components
    └── stores/          # Pinia stores
```

---

## Build/Lint/Test Commands

```bash
npm start        # Development mode (Electron + Vite dev servers)
npm run package # Package app as unsigned .app
npm run make    # Create distributable installer
npm run publish # Publish to GitHub Releases
```

**No test framework configured.** No linting configured.

---

## Code Style

### General
- **ES Modules**: `import`/`export` only (no CommonJS `require`)
- **No semicolons**: ASI-based formatting
- **Indentation**: 2 spaces | **Line endings**: LF
- **Comments**: Do NOT add comments unless explicitly requested

### Naming Conventions
- Variables/functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: prefix with `_`

### Imports
```javascript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { DownloadManager } from './main/downloader.js';  // internal modules use .js extension
```

### Async/Await & Error Handling
```javascript
// Always wrap async IPC handlers in try/catch
ipcMain.handle('channel-name', async (event, { param }) => {
  try {
    return { success: true, data: await someAsyncOp(param) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Use error.message for UI display, error.stack for debugging
// console.error with [PREFIX] format: [DOWNLOAD FAILED], [LAUNCHER], [FABRIC]
```

### Vue Components (`<script setup>`)
```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
const store = useLauncherStore();
</script>
```

### IPC Communication
```javascript
// Main: ipcMain.handle returns { success, data/error }
// Renderer: window.launcherAPI.someAction().then(handleResult)
// Events: window.launcherAPI.onStateChange(callback) → unsubscribe in onUnmounted
```

### Pinia Store
```javascript
export const useLauncherStore = defineStore('launcher', () => {
  const state = ref('idle');
  const isDownloading = computed(() => state.value === 'downloading');
  return { state, isDownloading };
});
```

### EventEmitter (DownloadManager, GameLauncher)
```javascript
class DownloadManager extends EventEmitter {
  _emitProgress(status) { this.emit('progress', status); }
}
downloadManager.on('progress', (status) => sendToRenderer('download-progress', status));
```

---

## Caching Strategy

Cached in `app.getPath('userData')/cache/`:
- `versions/{versionId}.json` - version JSON (permanent)
- `assets/indexes/{assetIndexId}.json` - asset index (permanent)

Manifest is **not** cached - fetched every time, but skipped if version JSON cache exists.

SHA1 verification: Files with `sha1: null` are re-downloaded if size is 0.

---

## Modloader Support

### Fabric (Currently Implemented)

**Configuration** in `src/main/fabric.js`:
```javascript
export const FABRIC_ENABLED = false;  // Toggle Fabric support
export const FABRIC_MC_VERSION = '1.21.1';  // Minecraft version
```

**Key Functions:**
- `getFabricVersions(mcVersion)` - Fetch from `https://meta.fabricmc.net/v2/versions/loader/{mcVersion}`
- `buildFabricLibraryItems(fabricData)` - Build download items for Fabric libraries
- `buildFabricVersionJson(fabricData, vanillaVersionJson)` - Merge Fabric with vanilla version JSON
- `getFabricClasspath(fabricData, vanillaVersionJson)` - Get Fabric classpath entries (prepended before vanilla libs)

**Fabric Maven:** `https://maven.fabricmc.net/`

---

## Development Notes

### Electron Main Process
- Context isolation enabled, nodeIntegration disabled
- All Node.js/file operations in main process only

### Vite Configs
- `vite.main.config.mjs` | `vite.preload.config.mjs` | `vite.renderer.config.mjs`
- Uses `@electron-forge/plugin-vite`

### Platform Detection
```javascript
import { platform, arch } from 'os';
// platform(): 'darwin' | 'linux' | 'win32' | arch(): 'x64' | 'arm64' | 'aarch_64'
```

### File Paths
```javascript
import path from 'node:path';
path.join(getMinecraftDir(), 'versions', versionId);  // Always use path.join()
```

### Window Check Pattern
```javascript
if (mainWindow && !mainWindow.isDestroyed()) {
  mainWindow.webContents.send(channel, data);
}
```

### Thread-Safe Queue (Mutex)
```javascript
async withMutex(fn) {
  while (this._mutex) { await sleep(10); }
  this._mutex = true;
  try { return await fn(); }
  finally { this._mutex = false; }
}
```

---

## Common Workflows

### Adding a new download/cache type:
1. Add `getXxxCachePath()`, `readXxxCache()`, `writeXxxCache()` in `downloader.js`
2. Export the read function if needed by `version.js`
3. Use in `version.js` or `downloader.js` as appropriate

### Adding a new modloader (e.g., Forge, NeoForge):
1. Create `src/main/{modloader}.js` with version fetching and library building
2. Add constants `{MODLOADER}_ENABLED` and `{MODLOADER}_MC_VERSION`
3. Modify `version.js`: add fetch call and merge version JSON
4. Modify `launcher.js`: update `buildClasspath()` to prepend modloader libraries
5. Update `getVersionInfo()` to return modloader-specific mainClass

### Game Launch Flow
1. `createVersionManager()` → fetches version manifest + JSON
2. If modloader enabled → fetch modloader data + merge version JSON
3. `DownloadManager` downloads all libraries, assets, and modloader files
4. `GameLauncher` receives merged version JSON + modloader data
5. `buildClasspath()` prepends modloader libraries before vanilla
6. `launch()` spawns Java process with correct classpath and mainClass
