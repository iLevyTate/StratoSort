# IPC → window.electronAPI Mapping (Quick Reference)

This file lists the renderer-side IPC usages we found and recommended mappings to the preload/context-bridge API (`window.electronAPI`). Use these mappings when migrating renderer code away from direct `require('electron')` or `window.electron` access.

- Renderer style (found) => Canonical channel (in `src/shared/constants.js`) => Recommended `window.electronAPI` call

---

## System / Logs

- `ipcRenderer.invoke('system:get-log-files', type)`
  - constant: `IPC_CHANNELS.SYSTEM.GET_LOG_FILES` (value: `get-log-files`)
  - recommended: `window.electronAPI.system.getLogFiles(type)`

- `ipcRenderer.invoke('system:get-recent-logs', type, limit)`
  - constant: `IPC_CHANNELS.SYSTEM.GET_RECENT_LOGS` (value: `get-recent-logs`)
  - recommended: `window.electronAPI.system.getRecentLogs(type, limit)`

- `ipcRenderer.invoke('system:get-log-stats')`
  - constant: `IPC_CHANNELS.SYSTEM.GET_LOG_STATS` (value: `get-log-stats`)
  - recommended: `window.electronAPI.system.getLogStats()`

- `ipcRenderer.invoke('system:read-log-file', type, filename)`
  - constant: `IPC_CHANNELS.SYSTEM.READ_LOG_FILE` (value: `read-log-file`)
  - recommended: `window.electronAPI.system.readLogFile(type, filename)`

## System / Metrics & Health

- `ipcRenderer.invoke('system:get-metrics')`
  - constant: `IPC_CHANNELS.SYSTEM.GET_METRICS` (value: `get-system-metrics`)
  - recommended: `window.electronAPI.system.getMetrics()`

- `ipcRenderer.invoke('system:get-system-status')`
  - constant: `IPC_CHANNELS.SYSTEM.GET_SYSTEM_STATUS` (value: `get-system-status`)
  - recommended: `window.electronAPI.system.getSystemStatus()`

- `ipcRenderer.invoke('system:perform-health-check')`
  - constant: `IPC_CHANNELS.SYSTEM.PERFORM_HEALTH_CHECK` (value: `perform-health-check`)
  - recommended: `window.electronAPI.system.performHealthCheck()`

## File operations (general mapping)

Renderer usage examples:

- `ipcRenderer.invoke('handle-file-selection')` → `IPC_CHANNELS.FILES.SELECT`
- `ipcRenderer.invoke('select-directory')` → `IPC_CHANNELS.FILES.SELECT_DIRECTORY`

Recommended `window.electronAPI` surface (examples):

- `window.electronAPI.files.select()`
- `window.electronAPI.files.selectDirectory()`
- `window.electronAPI.files.getDocumentsPath()`
- `window.electronAPI.files.open(filePath)`
- `window.electronAPI.files.reveal(filePath)`
- `window.electronAPI.files.organize(operations)`

Use the `src/shared/constants.js` file as the canonical source of truth for channel names. When migrating, prefer calling the higher-level `window.electronAPI` method rather than directly invoking the string channel.

## Patterns to replace

- `const { ipcRenderer } = require('electron')` or `import { ipcRenderer } from 'electron'`
  - Replace with using `window.electronAPI` functions or the preload shim: `const ipcRenderer = window.electron?.ipcRenderer;` (temporary).

- `const electron = require('electron')`
  - Replace with `const electron = window.electron || {}` (temporary) and migrate usages to `window.electronAPI`.

## Notes & Migration Tips

- Always prefer `window.electronAPI` methods that are explicitly exposed in `src/preload/preload.js`. This keeps `contextIsolation` and `nodeIntegration=false` enforced.
- For quick compatibility, `window.electron` shims can be used temporarily but should be removed once the renderer is migrated.
- After migrating source files, rebuild (`npm run build:dev`) and test the app without `ALLOW_NODE_REQUIRE`.

## Example migration (LogViewer)

- Before:

```js
import { ipcRenderer } from 'electron';
const result = await ipcRenderer.invoke('system:get-log-files', type);
```

- After:

```js
const result = await window.electronAPI.system.getLogFiles(type);
```

---

If you want, I can create a checklist PR that:

- replaces renderer files with recommended `window.electronAPI` calls, and
- removes the temporary `dist/renderer.js` shim after full migration.
