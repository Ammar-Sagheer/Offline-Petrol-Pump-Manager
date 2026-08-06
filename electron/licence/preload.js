/**
 * The activation window's own minimal bridge - deliberately separate from
 * the app's main preload.js. This window never loads the Next app or
 * anything else; it only ever shows electron/licence/activate.html, so its
 * privileges are scoped to exactly that.
 *
 * Three functions only, matching docs/LICENSING_PLAN.md exactly. Verification
 * happens in main (licence-window.js), never here - this just relays.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pumpManagerLicence', {
  getCode: () => ipcRenderer.invoke('licence-get-code'),
  activate: (text) => ipcRenderer.invoke('licence-activate', text),
  saveRequestFile: () => ipcRenderer.invoke('licence-save-request'),
});
