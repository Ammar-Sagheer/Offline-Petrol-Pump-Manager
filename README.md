# Offline Petrol Pump Manager

Offline desktop build of the Mubeen Petroleum Service pump-management app
(`Ammar-Sagheer/Petrol-Pump-Management-Software`), packaged with Electron so
it runs entirely on one Windows laptop: no internet, no Docker, no Supabase.
Electron starts a bundled Postgres binary and the Next.js server as child
processes, both bound to `127.0.0.1` only.

See `CLAUDE.md` for the architecture and the decisions already locked in, and
`PROGRESS.md` for the full history - what's built, how each piece was
verified, and the bug log of every real failure hit on actual hardware.

## Running it

```bash
npm install            # also downloads the platform Postgres binaries
npm run electron:dev   # fastest loop: Next dev server inside Electron
npm run electron       # production mode (needs `npm run build` first)
npm run dist           # build the installer into dist/
```

First launch creates the Postgres cluster, applies the migrations, and shows
a **first-run setup screen** to create the owner account - the offline app's
one deliberate difference from the web version, which relied on the Supabase
dashboard for that.

## Resetting the data after testing

The web app has an "empty everything" button under Settings. **In the
packaged desktop app that button does not appear**: it is gated on
`ALLOW_FULL_RESET`, and `electron/bootstrap-db.js` doesn't pass that variable
to the Next.js server. The offline equivalent is to delete the database
folder.

**Find the folder**: open **Backup** in the app - it prints the exact path
under "Where your data lives". (It varies by how the app was launched, so
read it there rather than guessing.) Inside it you'll find `db-data/`,
`config.json`, and any `backups/`.

**To reset**: quit the app completely, delete **`db-data/` only**, and start
the app again. It rebuilds an empty database and returns to the setup screen.

Leave `config.json` and `backups/` alone - `config.json` holds this install's
generated passwords and session secret (verified: the app reconnects fine
with the stored password against a rebuilt cluster), and `backups/` is where
the Backup screen writes.

**This is a harder reset than the web app's button.** That button keeps
logins, tanks, capacities and nozzle starting readings, and clears only
trading data. Deleting the folder wipes everything and re-seeds tanks and
nozzles at their defaults:

| | Web "empty everything" | Deleting `db-data/` |
|---|---|---|
| Readings, credit slips, ledger, deliveries, dips, expenses | cleared | cleared |
| Customers | cleared | cleared |
| Logins | **kept** | gone - setup screen returns |
| Tank capacity / opening stock | **kept** | back to defaults (25,000 / 50,000 L, 0 opening) |
| Nozzle starting readings | **kept** | **back to 0** |
| Bank accounts | kept | gone |

> **Before entering your first real day after a folder reset**, set the tank
> capacities and, most importantly, the **nozzle starting readings** under
> Settings → Edit nozzle wiring. Leaving them at 0 on a pump whose meters
> already read (say) 482,910 makes that first day record the meter's entire
> lifetime as one day of sales, and draws the tank down by hundreds of
> thousands of litres it never held.

If you'd rather have the in-app button instead, it only needs
`ALLOW_FULL_RESET: 'true'` added to the env block in
`electron/bootstrap-db.js` - the action and the UI are already written and
already require the owner's password plus typing `RESET`.

## Who fixed what

Both of us have worked on this branch, and the split is worth knowing when
reading the history:

- The port itself - schema, identity/RLS rewrite, the `pg` data layer, the
  UI sync with the web app - was done by Claude.
- **The three bugs that stopped the packaged `.exe` from ever starting were
  found and fixed by `owaisikhan`** (`fix/packaged-app-fails-to-start`,
  merged here), along with the reusable packaging guide below. Claude's
  testing had missed all three, because none of them reproduce in dev mode
  or when running `.next/standalone/server.js` with plain `node` - only the
  real installed `.exe` shows them. One of them (Pitfall 3) was made worse
  by Claude's own `node_modules` trimming.

`PROGRESS.md` has the full bug log with attribution and root causes.

---

The section below is written to be reusable: if you're converting a
**different** Next.js app into an Electron desktop app, read this first. It
covers every module and packaging gotcha that isn't obvious until you've hit
it on real hardware - dev-mode testing (`electron .`) does not surface most
of these; only the built installer does.

## Converting a Next.js app to Electron: required modules and known pitfalls

### Modules to install

```bash
npm install --save-dev electron electron-builder cross-env
```

- `electron` - the runtime.
- `electron-builder` - packages the installer (`.exe`/`.dmg`/AppImage).
- `cross-env` - sets environment variables (`NODE_ENV`, feature flags) in
  `package.json` scripts in a way that works on both Windows and Unix shells.

If the app talks to a database and you want it fully offline (no external
Postgres/MySQL server required), an embeddable binary package
(e.g. `embedded-postgres`) plus its plain `pg`/driver package are the other
common additions. Anything native-binary-based needs the packaging care
below.

### `next.config` must produce a standalone build

```js
// next.config.mjs
export default {
  output: 'standalone',
};
```

`next build` then emits `.next/standalone/` - a self-contained copy of the
app with its own `node_modules` (only the packages actually required at
runtime, traced from the app's imports) and a `server.js` you can run with
plain `node`. This is what Electron's main process should spawn - not
`next start`, which expects the full project tree including devDependencies.

### Pitfall 1: spawning the packaged `.exe` to run `server.js` needs `ELECTRON_RUN_AS_NODE`

```js
const nextEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
spawn(process.execPath, [serverJsPath], { env: nextEnv, stdio: [...] });
```

`process.execPath` inside a packaged Electron app *is* the app's own `.exe`.
Spawning it with a script path as an argument only does what you want in the
**unpacked dev** Electron binary (`node_modules/electron/dist/electron.exe`),
which treats its first argument as "the app directory/file to load" - a
generic behavior of the dev binary. A **packaged** `.exe` has its entry
point (your `main.js`) baked in at build time, so the same spawn call just
relaunches the whole app recursively instead of running the target script -
silently, with no error, and no output. `ELECTRON_RUN_AS_NODE=1` makes the
binary behave as a plain Node interpreter for that one child process
instead of trying to boot the Electron app. Symptom without this fix: the
spawned server never actually starts, so anything waiting on it (health
check, HTTP poll) times out with a generic "did not come up" error - the
real cause never gets logged anywhere.

### Pitfall 2: `stdio: 'inherit'` crashes or silently swallows output in a packaged app

A packaged Electron app on Windows/macOS is a GUI-subsystem executable with
**no console** when launched normally (double-click, Start Menu, Dock).
`process.stdout`/`stderr` in that main process are not valid handles to
inherit into a child process - `stdio: 'inherit'` can crash the child the
moment it tries to log anything, well before it finishes starting. Use real
pipes and log to a file instead:

```js
const child = spawn(process.execPath, [serverJsPath], {
  env: nextEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'a' });
child.stdout.pipe(log);
child.stderr.pipe(log);
```

Also race your startup wait against the child's `exit`/`error` events, not
just a timeout - a child that crashes in the first second should fail fast
with the real error, not after a blind 30-second wait for a server that was
never going to come up.

### Pitfall 3: electron-builder silently deletes `.next/standalone/node_modules`

This is the one most likely to cost real debugging time: the packaged app
launches, the server process starts, and it immediately crashes with
`Error: Cannot find module 'next'` (or `react`, or whatever the standalone
build needs) - even though `.next/standalone/**/*` is explicitly listed in
electron-builder's `files` config and the module is clearly present in the
pre-packaged build output on disk.

Cause: electron-builder's file walker treats **any** directory literally
named `node_modules` - root-level or nested anywhere in the tree - as a
special case. Before even considering individual file patterns, it checks
whether that whole directory "matches" your `files` patterns as a unit; if
not, the entire subtree is skipped, regardless of broader patterns like
`.next/standalone/**/*` that would otherwise include it. This is
undocumented/surprising behavior, confirmed by reading
`node_modules/app-builder-lib/out/util/AppFileWalker.js` directly - the
public docs don't explain it clearly.

Fix: set electron-builder's own documented escape hatch in the `build`
config:

```json
{
  "build": {
    "includeSubNodeModules": true
  }
}
```

This is especially likely to bite when the `files` list also does the
common "exclude all of node_modules, then re-include just a few specific
native packages" dance (needed when a native/platform-binary dependency,
like an embedded database, is used directly by the Electron main process
but shouldn't be duplicated into every build target):

```json
"files": [
  "electron/**/*",
  "!node_modules/**/*",
  "node_modules/pg/**/*",
  "node_modules/some-native-pkg/**/*",
  ".next/standalone/**/*"
]
```

`includeSubNodeModules: true` is what makes this combination actually work -
without it, `.next/standalone/node_modules` gets caught by the same
directory-level gate as the root `node_modules` exclusion, even though
nothing in the pattern list says to exclude it.

**How to verify the fix actually worked**, without a full install/uninstall
cycle each time: after `electron-builder` finishes, check the unpacked
output directly (`dist/win-unpacked/resources/app/.next/standalone/node_modules/`
on Windows) and confirm the packages you expect (`next`, `react`, etc.) are
really there - don't just trust that the build "succeeded". A quick
resolution check is even more direct:

```js
const Module = require('module');
const serverDir = path.resolve('dist/win-unpacked/resources/app/.next/standalone');
console.log(Module._resolveFilename('next', { paths: Module._nodeModulePaths(serverDir) }));
```

### Pitfall 4: `spawn('npx', ...)` fails on Windows

`npx` is `npx.cmd` on Windows; `child_process.spawn` can't execute a `.cmd`
file without `shell: true` (which brings its own cross-platform quoting
problems). If you need to run a CLI that's normally invoked via `npx`
(e.g. `next`), resolve its entry script directly and run it with `node`
instead - works identically on every OS, no shell involved:

```js
const nextBin = require.resolve('next/dist/bin/next');
spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', port], { ... });
```

### Pitfall 5: ESM-only dependencies in a CommonJS Electron main process

Electron's main process is CommonJS by default. Some npm packages
(including some embedded-database drivers) ship ESM-only. `require()` fails
with `ERR_REQUIRE_ESM`; a dynamic `import()` works from CommonJS regardless
of the target module's format:

```js
const { default: SomeEsmOnlyThing } = await import('some-esm-only-package');
```

### Pitfall 6: `asar: false` if you bundle native binaries

If the app bundles a native binary that needs to be executed directly (a
database server binary, a compiled tool, anything invoked via `spawn`/`exec`
rather than `require`d as a module), keep `asar: false` in the
electron-builder config, or explicitly `asarUnpack` that binary's path. A
binary sealed inside the `app.asar` virtual archive generally can't be
`chmod`'d or executed directly by the OS.

### Debugging checklist when the packaged app won't start but dev mode works fine

1. Does the main process set `ELECTRON_RUN_AS_NODE=1` on any child process
   it spawns via `process.execPath` with a script path? (Pitfall 1)
2. Is that child's `stdio` piped to a real log file, not `'inherit'`?
   (Pitfall 2) If not, add that first - it turns every subsequent mystery
   into a two-minute log read instead of a guessing game.
3. Check the packaged output's `node_modules` directories directly (not just
   "the build succeeded") - is everything the entry script `require()`s
   actually present on disk? (Pitfall 3)
4. Does startup fail fast on a child crash, or does it always wait out a
   fixed timeout regardless of what actually happened? A fixed timeout with
   a generic message hides the real error - fix that before spending time
   debugging blind.
