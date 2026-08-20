/**
 * Electron main process.
 *
 * Startup order matters: Postgres has to be accepting connections before the
 * Next.js server starts (it queries the database on nearly every request),
 * and the Next.js server has to be answering before the window points at it.
 *
 *   1. bootstrapDatabase() - start (or first-time initialise) the bundled
 *      Postgres binary, apply any pending migrations.
 *   2. spawn the Next.js standalone server as a child process, bound to
 *      127.0.0.1 only, with the database credentials from step 1 as env vars.
 *   3. open a BrowserWindow pointed at that local address.
 *
 * Shutdown runs the same list backwards, so the database is always stopped
 * cleanly (a killed-mid-write Postgres process is exactly the kind of thing
 * that turns "copy the folder" backups into a bad idea).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { bootstrapDatabase } = require('./bootstrap-db');
const { loadOrCreateConfig, userDataDir, dbDataDir, configPath } = require('./config');
const { requireLicence } = require('./licence-window');
const {
  loadLicence,
  saveLicence,
  setRestricted,
  localClockPastSupport,
  fingerprint,
  verify,
  isExpired,
  isRestricted,
  extractToken,
} = require('./licence');
const { checkOnlineStatus } = require('./licence-status');

const isDev = process.env.ELECTRON_DEV === 'true';

// Lazy: app.getPath() (inside userDataDir()) isn't safe to call before the
// app's ready event, and this module is require()'d well before that.
function getServerLogPath() {
  return path.join(userDataDir(), 'next-server.log');
}

function getUpdateLogPath() {
  return path.join(userDataDir(), 'update.log');
}

/**
 * Checks Ammar-Sagheer/Pump-manager-releases (a public repo holding nothing
 * but built installers - the app's own source stays private) for a newer
 * version, downloads it in the background if one exists, and asks before
 * installing rather than doing it out from under someone mid-shift.
 *
 * Every failure mode here has to be silent-but-logged, never a dialog the
 * owner has to dismiss: this app is built to run with no internet
 * dependency, so "no connection right now" is an expected, routine outcome
 * of this check, not an error worth interrupting anyone over.
 */
function checkForUpdates() {
  if (!app.isPackaged) return; // no app-update.yml in a dev/unpacked run

  // Support-until gating (a licence's `su` field, docs/LICENSING_PLAN.md)
  // ships DORMANT by owner's decision - the date already rides on every
  // issued licence, but nothing here acts on it yet. Flip this guard live
  // whenever enforcement should actually start; no licences need re-issuing
  // to do it, the date is already on them.
  //
  // const { loadLicence, isExpired } = require('./licence');
  // const licence = loadLicence();
  // if (licence?.payload?.su && new Date(licence.payload.su) < new Date()) return;

  // Required lazily, not at module top-level: destructuring autoUpdater
  // triggers its constructor immediately (it reads app.getVersion()), and
  // this module is require()'d well before app.whenReady() - same reasoning
  // as getServerLogPath() above.
  const { autoUpdater } = require('electron-updater');

  const logStream = fs.createWriteStream(getUpdateLogPath(), { flags: 'a' });
  const log = (line) => logStream.write(`${new Date().toISOString()} ${line}\n`);
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  autoUpdater.on('error', (error) => {
    log(`error: ${error.message}`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log(`downloaded: ${info.version}`);
    // mainWindow may have been closed while the download was in progress -
    // showMessageBox works window-independent when passed undefined instead.
    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: `Pump Manager ${info.version} has been downloaded.`,
      detail: 'Restart now to install it, or keep working - it installs automatically the next time the app closes.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch((error) => {
    log(`check failed: ${error.message}`);
  });
}

let mainWindow;
let nextProcess;
let stopDatabase;

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Next.js server did not come up within ${timeoutMs}ms`));
            return;
          }
          setTimeout(poll, 300);
        });
    })();
  });
}

// Races waitForServer() against the child dying, so a crash surfaces
// immediately (with its logged output) instead of only after the full 30s
// timeout - that timeout previously fired unconditionally even when the
// child had died in the first second, which just hid the real error.
function waitForServerOrExit(url, child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      const tail = fs.existsSync(getServerLogPath())
        ? fs.readFileSync(getServerLogPath(), 'utf8').slice(-4000)
        : '(no log output captured)';
      reject(
        new Error(
          `Next.js server process exited early (code ${code}, signal ${signal}).\n\n` +
            `Last output (${getServerLogPath()}):\n${tail}`,
        ),
      );
    };
    child.once('exit', onExit);
    child.once('error', onExit);

    waitForServer(url, timeoutMs).then(
      () => {
        if (settled) return;
        settled = true;
        child.removeListener('exit', onExit);
        child.removeListener('error', onExit);
        resolve();
      },
      (err) => {
        if (settled) return;
        settled = true;
        child.removeListener('exit', onExit);
        child.removeListener('error', onExit);
        reject(err);
      },
    );
  });
}

function startNextServer(env) {
  const config = loadOrCreateConfig();
  const port = String(config.nextPort);
  const nextEnv = {
    ...process.env,
    ...env,
    NODE_ENV: isDev ? 'development' : 'production',
    HOSTNAME: '127.0.0.1',
    PORT: port,
    // process.execPath is this very Electron binary. Without this, spawning
    // it with a script path only works in the unpacked dev binary (which
    // treats argv[1] as "the app to load"); a packaged .exe has its entry
    // point baked in and just relaunches the whole app recursively instead
    // of running the script. This flag makes Electron behave as a plain
    // Node interpreter for the child process instead.
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (isDev) {
    // Convenience path for `npm run electron:dev`: run against the Next dev
    // server instead of a standalone build, so UI changes hot-reload.
    //
    // Resolved and run directly with Node rather than spawn('npx', ...): npx
    // is npx.cmd on Windows, which plain spawn() cannot execute without
    // shell:true (and the quoting that comes with it) - require.resolve()
    // sidesteps PATH and the shell entirely, and works the same on every OS.
    //
    // stdio: 'inherit' is safe here because `npm run electron:dev` always
    // has a real console attached.
    const nextBin = require.resolve('next/dist/bin/next');
    nextProcess = spawn(
      process.execPath,
      [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', port],
      {
        cwd: path.join(__dirname, '..'),
        env: nextEnv,
        stdio: 'inherit',
      },
    );
  } else {
    // The packaged app is a Windows GUI-subsystem executable with no
    // console, so process.stdout/stderr in this (the main) process are not
    // valid handles - stdio: 'inherit' would hand the child broken/absent
    // std handles, which can crash it the moment it tries to log anything,
    // before it ever binds its port. Pipe to a real file instead.
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
    nextProcess = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: nextEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logStream = fs.createWriteStream(getServerLogPath(), { flags: 'a' });
    logStream.write(`\n--- launch ${new Date().toISOString()} ---\n`);
    nextProcess.stdout.pipe(logStream);
    nextProcess.stderr.pipe(logStream);
  }

  return `http://127.0.0.1:${port}`;
}

async function createWindow(env) {
  const url = startNextServer(env);
  await waitForServerOrExit(url, nextProcess);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // contextIsolation/nodeIntegration stay as they are for every page the
      // renderer loads - the preload adds exactly one function (restoring a
      // backup - see preload.js and performRestore() below), not general
      // Node access.
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function shutdown() {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
  if (stopDatabase) {
    await stopDatabase();
    stopDatabase = null;
  }
}

/**
 * Where the pre-restore data goes: one fixed slot, not a new timestamped one
 * per restore. Only ever holds what was live immediately before the most
 * recent restore - restoring again overwrites it, on purpose. It is a single
 * undo step, not a history.
 */
function replacedDir() {
  return path.join(userDataDir(), 'replaced');
}

/**
 * Restores db-data and config.json from a backup folder - see
 * docs/RESTORE_FROM_BACKUP.md for the full reasoning. Runs entirely here,
 * not in the Next.js child, because it has to stop and replace the very
 * database that child is running against (Decision 2 in that doc).
 *
 * Called with no argument for the folder-picker case (a new/wiped machine);
 * called with a path for restoring one of the in-app backup list's own
 * entries, or with replacedDir() itself to undo the most recent restore -
 * see "Undoing a restore" below for why that last case needs its own step.
 *
 * ORDERING NOTE, differs from the doc's sketch: shutdown() runs BEFORE the
 * snapshot rename, not after. Postgres holds files open inside db-data while
 * it runs, and Windows refuses to rename a directory that has open handles
 * inside it - renaming it live first (as the doc originally sketched) fails
 * on the one platform this app actually ships on.
 */
async function performRestore(sourcePath) {
  let folder = sourcePath;

  if (!folder) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the backup folder to restore',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled.' };
    }
    folder = result.filePaths[0];
  }

  // Validate before touching anything live. Someone picking the wrong folder
  // is the likeliest failure, not a corrupt backup, and it should say so
  // plainly rather than fail halfway through something destructive.
  if (!fs.existsSync(path.join(folder, 'db-data', 'PG_VERSION'))) {
    return {
      ok: false,
      message: `That does not look like a backup folder - no db-data/PG_VERSION found in ${folder}.`,
    };
  }

  let sourceConfig;
  try {
    sourceConfig = JSON.parse(fs.readFileSync(path.join(folder, 'config.json'), 'utf8'));
  } catch {
    return {
      ok: false,
      message: `That folder is missing a readable config.json - cannot restore from ${folder}.`,
    };
  }
  const requiredKeys = ['pgPort', 'appUserPassword', 'sessionSecret'];
  const missingKeys = requiredKeys.filter((key) => !(key in sourceConfig));
  if (missingKeys.length > 0) {
    return {
      ok: false,
      message:
        `config.json in that folder is missing ${missingKeys.join(', ')} - ` +
        'this looks like an incomplete or very old backup.',
    };
  }

  const liveDbData = dbDataDir();
  const liveConfigPath = configPath();
  const slot = replacedDir();
  const slotDbData = path.join(slot, 'db-data');
  const slotConfigPath = path.join(slot, 'config.json');

  // Undoing a restore means restoring FROM the slot the CURRENT restore is
  // about to overwrite - the normal sequence below can't run as-is, because
  // by the time it clears the slot to hold the new snapshot, the very data
  // it needs to copy into live would already be gone. Copy it out to a
  // scratch location first in that one case; every other restore reads
  // directly from its own folder, untouched by any of this.
  const isUndo = path.resolve(folder) === path.resolve(slot);
  const stagingDir = isUndo ? `${slot}.staging` : null;
  const sourceDbData = isUndo ? path.join(stagingDir, 'db-data') : path.join(folder, 'db-data');
  const sourceConfigPath = isUndo ? path.join(stagingDir, 'config.json') : path.join(folder, 'config.json');

  if (isUndo) {
    await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.cp(slot, stagingDir, { recursive: true });
  }

  // From here on we are committed: shutdown() is about to stop Postgres, so
  // every path out of this function - success or failure - ends in a
  // relaunch. There is no version of "stop the database, then just return an
  // error to a page whose server just lost its database" that leaves the app
  // in a working state.
  let failureMessage = null;
  try {
    await shutdown();

    // Snapshot what is there now, before overwriting it - moved into the one
    // fixed slot, not deleted, so a copy failure below still has a way back,
    // and the Backup page can offer "undo this restore" afterwards either
    // way. Single slot: whatever was here from an earlier restore is gone
    // once this one commits - it is one undo step, not a history.
    await fs.promises.rm(slot, { recursive: true, force: true });
    await fs.promises.mkdir(slot, { recursive: true });
    await fs.promises.rename(liveDbData, slotDbData);
    await fs.promises.rename(liveConfigPath, slotConfigPath);

    await fs.promises.cp(sourceDbData, liveDbData, {
      recursive: true,
      // Same reason createBackup() excludes these going out: they describe a
      // running server, and an older or foreign backup might still carry
      // them. Postgres refuses to start from a folder that has one.
      filter: (source) => {
        const name = path.basename(source);
        return name !== 'postmaster.pid' && name !== 'postmaster.opts';
      },
    });
    await fs.promises.copyFile(sourceConfigPath, liveConfigPath);
    await fs.promises.chmod(liveConfigPath, 0o600);
  } catch (error) {
    failureMessage = error.message;

    // Put back whatever was moved aside. Best-effort and defensive about
    // exactly how far the sequence got - the failure could be the very first
    // rename or partway through the copy.
    await fs.promises.rm(liveDbData, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(liveConfigPath, { force: true }).catch(() => {});
    if (fs.existsSync(slotDbData)) {
      await fs.promises.rename(slotDbData, liveDbData).catch(() => {});
    }
    if (fs.existsSync(slotConfigPath)) {
      await fs.promises.rename(slotConfigPath, liveConfigPath).catch(() => {});
    }
  } finally {
    if (stagingDir) {
      await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // A clean restart re-runs bootstrapDatabase() against whichever data is
  // actually in place now, reads the matching config.json, and spawns the
  // Next server with the matching credentials - simpler and far more
  // predictable than trying to re-wire the already-running app.
  app.relaunch();
  app.exit(0);

  return failureMessage
    ? { ok: false, message: `Restore failed and was rolled back: ${failureMessage}` }
    : { ok: true, message: 'Restored. Relaunching...' };
}

ipcMain.handle('restore-from-backup', (_event, sourcePath) => performRestore(sourcePath));

/**
 * In-app licence renewal - the two handlers behind the Renew dialog (see
 * app/_components/ui/RenewLicenceDialog.js). Registered here at module load
 * and never torn down, unlike licence-window.js's own 'licence-*' handlers,
 * which exist only for as long as the pre-launch activation window is open.
 * The channel names are deliberately different from that window's for the
 * same reason: both can be registered at once during a first-run activation,
 * and two handlers on one channel is an outright throw.
 *
 * Why renewal happens here at all rather than by relaunching into the
 * activation window: a licence that has run out is not a reason to interrupt
 * a shift. The reading being typed when the renewal arrives should still be
 * there afterwards - so nothing here touches the session, the Next child, or
 * the window. It writes licence.json and returns; the renderer refreshes and
 * the restriction is simply gone, because isRestricted() on the Next side
 * reads that file fresh on every call (app/_lib/licence.js).
 */
ipcMain.handle('licence-info', () => {
  const stored = loadLicence();
  return {
    code: fingerprint(),
    restricted: isRestricted(),
    licence: stored
      ? {
          business: stored.payload.b,
          key: stored.payload.k,
          seat: stored.payload.s,
          issued: stored.payload.ia,
          supportUntil: stored.payload.su,
        }
      : null,
  };
});

ipcMain.handle('licence-renew', (_event, rawText) => {
  let payload;
  const cleaned = extractToken(rawText);
  try {
    payload = verify(cleaned);
  } catch {
    return {
      ok: false,
      message: "That doesn't look like a licence. Try the 'Load from file' button.",
    };
  }
  // Same three refusals, in the same order and the same words, as the
  // activation window's own handler - a client who sees one of these while
  // renewing should not be told something different from what they were told
  // the first time.
  if (payload.m !== fingerprint()) {
    return { ok: false, message: 'That licence was issued for a different computer.' };
  }
  if (isExpired(payload)) {
    return { ok: false, message: `That licence expired on ${payload.ex}.` };
  }

  // Clears `restricted` as a side effect - see saveLicence()'s own comment.
  // That is the whole mechanism by which renewing lifts the block; there is
  // deliberately no separate "unrestrict" call to get out of step with it.
  saveLicence(cleaned);
  return { ok: true, supportUntil: payload.su, business: payload.b };
});

/**
 * No application menu at all.
 *
 * There was never any menu code here, which meant Electron's stock one -
 * File / Edit / View / Window / Help - and its Help entry links out to
 * electronjs.org, documentation for the framework this happens to be built
 * with. Nothing on it belongs in front of a pump attendant, and one of its
 * items advertises what the app is made of to a client who has no reason to
 * care and no reason to click it.
 *
 * Removing the whole bar rather than trimming Help off it: the rest is not
 * doing any work either. This is a single-purpose till screen, and View's
 * zoom levels and fullscreen toggle are, on a shared machine, mostly ways to
 * leave the display in a state the next person has to undo. The editing
 * shortcuts everyone actually uses - Ctrl+C/V/X/A, Ctrl+Z in a text field -
 * are handled natively by Chromium and do NOT need a menu entry to work;
 * they were tested with the bar gone.
 *
 * Called before the window exists, since the menu is process-wide.
 */
Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  try {
    // Before bootstrapDatabase(), on purpose - see docs/LICENSING_PLAN.md,
    // "The activation window": there is no point starting Postgres for a
    // machine that will not be allowed to run, and the window cannot use
    // Next anyway since that server is not up yet. Resolves to a token (a
    // verified licence for this machine) or a graceUntil date (an existing,
    // not-yet-licensed install); never neither - see requireLicence()'s own
    // doc comment.
    const licence = await requireLicence();
    const licenceEnv = licence.token
      ? { LICENCE_TOKEN: licence.token }
      : { LICENCE_GRACE_UNTIL: licence.graceUntil };

    // The weak, offline-only half of restriction enforcement - see
    // docs/LICENSING_PLAN.md. Only ever pushes restricted toward true; never
    // clears it (that is deliberately reserved for checkOnlineStatus() below,
    // which uses a timestamp the client cannot fake by adjusting a clock).
    // Nothing to check yet during a grace period - there is no token to read
    // a support date off.
    if (licence.token) {
      const stored = loadLicence();
      if (stored && localClockPastSupport(stored.payload)) {
        setRestricted(true);
      }
    }

    const { env, stop } = await bootstrapDatabase();
    stopDatabase = stop;
    await createWindow({ ...env, ...licenceEnv });

    // Both delayed, and neither awaited here - checking for an update, and
    // checking online restriction status, are both strictly best-effort
    // background work that must never slow down or block a normal launch.
    // Restriction status is read fresh from licence.json on every check the
    // Next side does (app/_lib/licence.js), so updating it here takes effect
    // immediately - no relaunch needed, unlike the token itself.
    setTimeout(checkForUpdates, 10_000);
    setTimeout(checkOnlineStatus, 10_000);
  } catch (error) {
    console.error('[startup] failed:', error);
    dialog.showErrorBox(
      'Could not start Pump Manager',
      `${error.message}\n\nClosing the app. If this keeps happening, back up and remove ` +
        'the db-data folder in the app data directory and try again.',
    );
    app.exit(1);
  }
});

app.on('window-all-closed', async () => {
  await shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (nextProcess || stopDatabase) {
    event.preventDefault();
    await shutdown();
    app.exit(0);
  }
});
