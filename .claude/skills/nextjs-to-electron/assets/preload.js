/**
 * The renderer runs with contextIsolation on and no Node access. This exposes
 * the few specific things the pages need from the main process - never a
 * general bridge.
 *
 * Anything that has to stop or replace the running server or database belongs
 * here rather than in a Server Action, because a Server Action runs inside the
 * very child process being replaced.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Resolves to { ok, message }. The main process handles the folder picker,
  // validation, shutdown and relaunch - see references/backup-and-restore.md.
  restoreFromBackup: (sourcePath) => ipcRenderer.invoke('restore-from-backup', sourcePath),
});
