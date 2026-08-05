/**
 * The one and only bridge between the renderer (a full Next.js app, running
 * with contextIsolation: true and nodeIntegration: false) and the main
 * process - restoring a backup has to happen in main (see the "why" in
 * docs/RESTORE_FROM_BACKUP.md: it means stopping and replacing the very
 * database the renderer's server is running against, which the renderer's
 * own process cannot do to itself).
 *
 * Exposes exactly one function. Not ipcRenderer itself - the renderer loads
 * arbitrary app pages, and widening its privileges for one button is a bad
 * trade for what it buys.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pumpManager', {
  restoreFromBackup: (sourcePath) => ipcRenderer.invoke('restore-from-backup', sourcePath),
});
