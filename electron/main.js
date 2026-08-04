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
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow, dialog } = require('electron');
const { bootstrapDatabase } = require('./bootstrap-db');
const { loadOrCreateConfig } = require('./config');

const isDev = process.env.ELECTRON_DEV === 'true';

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

function startNextServer(env) {
  const config = loadOrCreateConfig();
  const port = String(config.nextPort);
  const nextEnv = {
    ...process.env,
    ...env,
    NODE_ENV: isDev ? 'development' : 'production',
    HOSTNAME: '127.0.0.1',
    PORT: port,
  };

  if (isDev) {
    // Convenience path for `npm run electron:dev`: run against the Next dev
    // server instead of a standalone build, so UI changes hot-reload.
    //
    // Resolved and run directly with Node rather than spawn('npx', ...): npx
    // is npx.cmd on Windows, which plain spawn() cannot execute without
    // shell:true (and the quoting that comes with it) - require.resolve()
    // sidesteps PATH and the shell entirely, and works the same on every OS.
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
    const serverPath = path.join(__dirname, '..', '.next', 'standalone', 'server.js');
    nextProcess = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: nextEnv,
      stdio: 'inherit',
    });
  }

  return `http://127.0.0.1:${port}`;
}

async function createWindow(env) {
  const url = startNextServer(env);
  await waitForServer(url);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // The renderer only ever loads our own local server - no need for
      // Node integration or a preload script in the page itself.
      contextIsolation: true,
      nodeIntegration: false,
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
