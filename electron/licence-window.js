/**
 * Decides whether the app may start at all, and shows the activation window
 * when it has to - see docs/LICENSING_PLAN.md for the full scheme. Kept
 * separate from licence.js on purpose: that file is pure data (read, verify,
 * write); this one is the only place that touches a BrowserWindow, ipcMain
 * or the filesystem's Desktop path.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { dbDataDir } = require('./config');
const {
  fingerprint,
  verify,
  isExpired,
  loadLicence,
  saveLicence,
  ensureGraceStarted,
} = require('./licence');

const GRACE_DAYS = 14;

function graceDeadline(startedAt) {
  return new Date(new Date(startedAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Resolves to `{ token }` - a verified licence matching this machine, ready
 * to ride into the Next child's env exactly the way bootstrapDatabase()'s
 * own env does - or `{ graceUntil }`, for an existing install with real data
 * but no matching licence yet. Never resolves with neither; a genuinely
 * fresh install with no licence and no prior data blocks on the activation
 * window until the owner activates or quits (which exits the app).
 */
async function requireLicence() {
  const myFingerprint = fingerprint();
  const stored = loadLicence();

  if (stored && stored.payload.m === myFingerprint && !isExpired(stored.payload)) {
    return { token: stored.token };
  }

  // An existing install (already has real data) with no matching licence -
  // this path exists specifically so a release does not lock out someone who
  // already paid, mid-shift, because his licence had not arrived yet. See
  // docs/LICENSING_PLAN.md, "The risk that will bite first".
  const hasExistingData = fs.existsSync(path.join(dbDataDir(), 'PG_VERSION'));
  if (!stored && hasExistingData) {
    const deadline = graceDeadline(ensureGraceStarted());
    if (deadline > new Date()) {
      return { graceUntil: deadline.toISOString() };
    }
  }

  const reason = !stored ? null : stored.payload.m !== myFingerprint ? 'machine' : 'expired';
  return showActivationWindow(myFingerprint, reason);
}

function showActivationWindow(myFingerprint, initialReason) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 700,
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'licence', 'preload.js'),
      },
    });
    win.loadFile(path.join(__dirname, 'licence', 'activate.html'));

    let settled = false;
    const cleanup = () => {
      ipcMain.removeHandler('licence-get-code');
      ipcMain.removeHandler('licence-activate');
      ipcMain.removeHandler('licence-save-request');
    };

    ipcMain.handle('licence-get-code', () => ({ code: myFingerprint, reason: initialReason }));

    ipcMain.handle('licence-activate', (_event, rawText) => {
      let payload;
      try {
        payload = verify(rawText);
      } catch {
        return {
          ok: false,
          message: "That doesn't look like a licence. Try the 'Load from file' button.",
        };
      }
      if (payload.m !== myFingerprint) {
        return { ok: false, message: 'That licence was issued for a different computer.' };
      }
      if (isExpired(payload)) {
        return { ok: false, message: `That licence expired on ${payload.ex}.` };
      }

      saveLicence(rawText);
      settled = true;
      cleanup();
      win.close();
      resolve({ token: rawText });
      return { ok: true };
    });

    ipcMain.handle('licence-save-request', () => {
      const file = path.join(os.homedir(), 'Desktop', 'pump-manager-request.txt');
      const body = [
        `Installation code: ${myFingerprint}`,
        `App version: ${app.getVersion()}`,
        `Date: ${new Date().toISOString().slice(0, 10)}`,
        '',
      ].join('\n');
      try {
        fs.writeFileSync(file, body, 'utf8');
        return { ok: true, path: file };
      } catch (error) {
        return { ok: false, message: error.message };
      }
    });

    win.on('closed', () => {
      if (settled) return;
      // Closing this window unanswered has exactly one sane outcome: there is
      // no app to show without a licence or an active grace period.
      cleanup();
      app.exit(0);
    });
  });
}

module.exports = { requireLicence };
