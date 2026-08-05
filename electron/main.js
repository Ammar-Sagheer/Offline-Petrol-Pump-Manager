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
const { app, BrowserWindow, dialog } = require('electron');
const { bootstrapDatabase } = require('./bootstrap-db');
const { loadOrCreateConfig, userDataDir } = require('./config');

const isDev = process.env.ELECTRON_DEV === 'true';

// Lazy: app.getPath() (inside userDataDir()) isn't safe to call before the
// app's ready event, and this module is require()'d well before that.
function getServerLogPath() {
  return path.join(userDataDir(), 'next-server.log');
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
