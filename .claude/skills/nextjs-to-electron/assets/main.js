/**
 * Electron main process - starting point, adapt freely.
 *
 * Startup order matters: the database has to be accepting connections before
 * the Next.js server starts (it queries on nearly every request), and the
 * server has to be answering before the window points at it.
 *
 *   1. bootstrapDatabase() - start (or first-time initialise) the bundled
 *      database, apply any pending migrations.
 *   2. spawn the Next.js standalone server, bound to 127.0.0.1 only, with the
 *      database credentials from step 1 as environment variables.
 *   3. open a BrowserWindow pointed at that local address.
 *
 * Shutdown runs the same list backwards, so the database is always stopped
 * cleanly - a killed-mid-write database is what turns "copy the folder"
 * backups into a bad idea.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow, dialog } = require('electron');
const { bootstrapDatabase } = require('./bootstrap-db');
const { loadOrCreateConfig, userDataDir } = require('./config');

const isDev = process.env.ELECTRON_DEV === 'true';

let mainWindow;
let nextProcess;
let stopDatabase;

// Lazy: app.getPath() isn't safe to call before the app's ready event, and
// this module is require()'d well before that.
function serverLogPath() {
  return path.join(userDataDir(), 'next-server.log');
}

function waitForServer(url, timeoutMs) {
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
            reject(new Error(`Server did not come up within ${timeoutMs}ms`));
            return;
          }
          setTimeout(poll, 300);
        });
    })();
  });
}

/**
 * Races waitForServer() against the child dying, so a crash surfaces
 * immediately with its logged output instead of only after the full timeout.
 * A blind timeout fires identically whether the child crashed in the first
 * second or is merely slow, which hides the real error every time.
 */
function waitForServerOrExit(url, child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      const tail = fs.existsSync(serverLogPath())
        ? fs.readFileSync(serverLogPath(), 'utf8').slice(-4000)
        : '(no log output captured)';
      reject(new Error(`Server exited early (code ${code}, signal ${signal}).\n\n${tail}`));
    };
    child.once('exit', onExit);
    child.once('error', onExit);

    const done = (fn) => (value) => {
      if (settled) return;
      settled = true;
      child.removeListener('exit', onExit);
      child.removeListener('error', onExit);
      fn(value);
    };
    waitForServer(url, timeoutMs).then(done(resolve), done(reject));
  });
}

function startNextServer(env) {
  const config = loadOrCreateConfig();
  const port = String(config.nextPort);
  const nextEnv = {
    ...process.env,
    ...env,
    NODE_ENV: isDev ? 'development' : 'production',
    HOSTNAME: '127.0.0.1', // loopback only - never serve to the local network
    PORT: port,
    // process.execPath is this very Electron binary. Without this flag,
    // spawning it with a script path only works in the unpacked dev binary
    // (which treats argv[1] as "the app to load"); a packaged executable has
    // its entry point baked in and just relaunches the whole app recursively.
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (isDev) {
    // Run the Next dev server so UI changes hot-reload.
    //
    // Resolved and run directly with Node rather than spawn('npx', ...): npx
    // is npx.cmd on Windows, which plain spawn() cannot execute without
    // shell:true and its quoting problems. require.resolve() sidesteps PATH
    // and the shell entirely, identically on every OS.
    //
    // stdio: 'inherit' is safe here only because the dev script always has a
    // real console attached.
    const nextBin = require.resolve('next/dist/bin/next');
    nextProcess = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', port], {
      cwd: path.join(__dirname, '..'),
      env: nextEnv,
      stdio: 'inherit',
    });
  } else {
    // The packaged app is a GUI-subsystem executable with no console, so this
    // process's stdout/stderr are not valid handles to inherit into a child -
    // that can crash it the moment it logs anything, before it binds its port.
    // Pipe to a real file instead; it is the only debugging you will have.
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
    nextProcess = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: nextEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logStream = fs.createWriteStream(serverLogPath(), { flags: 'a' });
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
      contextIsolation: true,
      nodeIntegration: false,
      // The preload should expose specific functions the renderer needs from
      // the main process (restoring a backup, picking a folder), never general
      // Node access.
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

app.whenReady().then(async () => {
  try {
    const { env, stop } = await bootstrapDatabase();
    stopDatabase = stop;
    await createWindow(env);
  } catch (error) {
    console.error('[startup] failed:', error);
    dialog.showErrorBox('Could not start', `${error.message}\n\nClosing the app.`);
    app.exit(1);
  }
});

app.on('window-all-closed', async () => {
  await shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (nextProcess || stopDatabase) {
    event.preventDefault();
    await shutdown();
    app.exit(0);
  }
});
