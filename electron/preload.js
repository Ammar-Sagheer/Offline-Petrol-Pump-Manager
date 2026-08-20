/**
 * The one and only bridge between the renderer (a full Next.js app, running
 * with contextIsolation: true and nodeIntegration: false) and the main
 * process. Two things need it, and both need it for the same underlying
 * reason - they are things the renderer's own server process cannot do to
 * itself:
 *
 *   - restoreFromBackup: stopping and replacing the very database the
 *     renderer's server is running against (see docs/RESTORE_FROM_BACKUP.md).
 *   - licenceInfo / renewLicence: reading the machine fingerprint and
 *     writing licence.json, both of which live in main (electron/licence.js)
 *     because the pre-launch activation window needs them before the Next
 *     server exists at all. Renewal reuses that same code rather than
 *     growing a second verification path on the Next side.
 *
 * Still an explicit, named list - NOT ipcRenderer itself. The renderer loads
 * arbitrary app pages, and widening its privileges is a bad trade for what
 * it buys. Three named functions is a bigger surface than one, and each was
 * added on that basis, not by loosening the rule.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pumpManager', {
  restoreFromBackup: (sourcePath) => ipcRenderer.invoke('restore-from-backup', sourcePath),
  licenceInfo: () => ipcRenderer.invoke('licence-info'),
  renewLicence: (text) => ipcRenderer.invoke('licence-renew', text),
});
