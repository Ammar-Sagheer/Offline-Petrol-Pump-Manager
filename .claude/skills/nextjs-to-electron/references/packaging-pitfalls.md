# Packaging pitfalls

Every failure here was hit on real hardware, after the build was "finished".
None of them reproduce in `electron .` dev mode, and several do not reproduce
even when running `.next/standalone/server.js` with plain `node` - only the
installed application shows them. That is the single most important fact about
this stage of the work: **dev mode cannot test packaging**, so a plan that ends
at "it works in dev" has not started this stage yet.

Contents:

1. Spawning `process.execPath` needs `ELECTRON_RUN_AS_NODE`
2. `stdio: 'inherit'` breaks a packaged GUI app
3. electron-builder silently deletes `.next/standalone/node_modules`
4. `spawn('npx', ...)` fails on Windows
5. ESM-only dependencies in a CommonJS main process
6. `asar: false` when native binaries are involved
7. The build hangs at the signing step
8. Proving the trimmed set is complete
9. Debugging checklist

---

## 1. Spawning `process.execPath` needs `ELECTRON_RUN_AS_NODE`

**Symptom.** The packaged app installs and launches, the window never appears,
and eventually a generic "server did not come up" error fires. Nothing is
logged, because the child never got far enough to log anything. Works
perfectly in dev.

**Cause.** `process.execPath` inside a packaged app is the app's own
executable. Passing it a script path only does what you want in the *unpacked
dev* Electron binary, which treats its first argument as "the app to load".
A packaged executable has its entry point baked in at build time, so the same
spawn call relaunches the whole application recursively - silently, with no
error - instead of running the target script.

**Fix.**

```js
const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
```

That flag makes the binary behave as a plain Node interpreter for that one
child process.

## 2. `stdio: 'inherit'` breaks a packaged GUI app

**Symptom.** The child process dies immediately, or produces no output
anywhere, in the packaged app only.

**Cause.** A packaged Electron app launched normally (double-click, Start
menu, Dock) is a GUI-subsystem executable with **no console**. The main
process's own `stdout`/`stderr` are not valid handles to hand to a child, so
`'inherit'` can kill the child the moment it tries to log - before it ever
binds its port.

**Fix.** Pipe to a real file in the app-data folder:

```js
const child = spawn(process.execPath, [serverPath], {
  env: nextEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'a' });
child.stdout.pipe(log);
child.stderr.pipe(log);
```

Do this first, before debugging anything else in a packaged build. It turns
every later mystery into a two-minute log read. `'inherit'` is fine in the dev
script, which always has a console attached.

**And race the startup wait against the child dying**, rather than only
against a timeout:

```js
child.once('exit', (code) => reject(new Error(`server exited early (${code})\n${tailOfLog()}`)));
```

A fixed 30-second timeout with a generic message hides the real error in every
case where the child crashed in the first second - which is most of them.

## 3. electron-builder silently deletes `.next/standalone/node_modules`

**Symptom.** The packaged app starts, the server child immediately exits with
`Cannot find module 'next'` (or `react`), even though `.next/standalone/**/*`
is listed in `files` and the module is plainly present in the build output on
disk.

**Cause.** electron-builder's file walker treats **any** directory named
`node_modules` - nested anywhere, not just at the root - as a special case,
evaluated *before* individual file patterns. If that whole directory does not
match the `files` patterns as a unit, the entire subtree is skipped no matter
what broader globs would otherwise include it. This is confirmed by reading
`node_modules/app-builder-lib/out/util/AppFileWalker.js`; the public
documentation does not explain it.

**Fix.** Two things, both needed:

```json
{
  "includeSubNodeModules": true,
  "files": [
    "electron/**/*",
    "package.json",
    "!node_modules/**/*",
    "node_modules/pg/**/*",
    "node_modules/embedded-postgres/**/*",
    ".next/standalone/**/*"
  ]
}
```

**Order matters in that list.** `.next/standalone/**/*` has to come *after*
the `!node_modules/**/*` negation, and the re-included packages have to come
after it too. This is far more order- and gate-sensitive than it looks, and
trimming the root `node_modules` list (see §8) is what usually exposes it.

## 4. `spawn('npx', ...)` fails on Windows

**Symptom.** `spawn npx ENOENT`, Windows only, usually in the dev script.

**Cause.** `npx` is `npx.cmd` on Windows, and `child_process.spawn` cannot
execute a `.cmd` without `shell: true` - which brings its own cross-platform
quoting problems.

**Fix.** Resolve the CLI's entry script and run it with Node directly. No
shell, no PATH lookup, identical on every OS:

```js
const nextBin = require.resolve('next/dist/bin/next');
spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', port], { ... });
```

## 5. ESM-only dependencies in a CommonJS main process

**Symptom.** `ERR_REQUIRE_ESM` at startup.

**Cause.** Electron's main process is CommonJS. Some packages - embedded
database drivers among them - ship ESM-only.

**Fix.** A dynamic `import()` works from CommonJS regardless of the target's
format. Put it inside the async function that needs it:

```js
const { default: EmbeddedPostgres } = await import('embedded-postgres');
```

## 6. `asar: false` when native binaries are involved

**Symptom.** `ENOENT` or `chmod ENOTDIR` on a path inside `app.asar`, at first
launch of the packaged app.

**Cause.** `asar` packs the app into a virtual archive. A binary that has to
be *executed* (a database server, a compiled tool - anything invoked through
`spawn`, not `require`) generally cannot be `chmod`'d or run from inside it,
and packages that resolve their own binary paths do not reliably follow
Electron's asar-unpack redirection.

**Fix.** Set `"asar": false`. Chasing `asarUnpack` glob patterns file by file
is possible but repeatedly wrong; turning it off entirely makes everything
real files on disk, so no dependency's path resolution needs to know it is
inside a packaged app. The cost is a slightly larger, browsable install
directory, which for a desktop line-of-business app is not a real cost.

## 7. The build hangs at the signing step

**Symptom.** `electron-builder` prints `signing with signtool.exe
path=...elevate.exe` and never returns.

**Cause.** electron-builder probes for a code-signing certificate on every
packaged binary. `signtool` enumerating the Windows certificate store is a
well-known cause of an indefinite hang when no certificate is configured.

**Fix.**

```json
"win": { "signAndEditExecutable": false }
```

plus `CSC_IDENTITY_AUTO_DISCOVERY=false` on the build script (electron-builder's
own documented escape hatch). Use `cross-env` so the script works in both
PowerShell and a Unix shell.

Note that unsigned installers still trigger a SmartScreen warning on Windows.
That is a separate problem, solved by buying a certificate, not by this flag.

## 8. Proving the trimmed set is complete

Shipping all of `node_modules` makes the NSIS step appear to hang for a very
long time (it is not hung - it is compressing hundreds of megabytes, most of
it already duplicated inside `.next/standalone`). Trimming to what the main
process actually requires cuts that dramatically.

Compute the set with `scripts/runtime-deps.js` rather than by hand -
hand-guessing transitive package names is reliably wrong, and each wrong guess
costs a full build-install-launch cycle to discover.

Then prove it, without a full install cycle:

```js
// Copy the packaged app's node_modules somewhere OUTSIDE the source tree
// first - otherwise Node's resolution walks up into the project's own
// node_modules and every check passes for the wrong reason.
const Module = require('module');
const dir = '/tmp/packaged-check';
console.log(Module._resolveFilename('pg', { paths: Module._nodeModulePaths(dir) }));
```

Do the same for `.next/standalone`: check
`dist/win-unpacked/resources/app/.next/standalone/node_modules/` really
contains `next` and `react`. "The build succeeded" is not evidence - §3 fails
with a successful build.

## 9. Debugging checklist: packaged app won't start, dev mode is fine

Work down this list in order. It is ordered by how much time each step saves.

1. **Is the child's `stdio` piped to a log file rather than `'inherit'`?** (§2)
   If not, fix that first - everything below is guesswork without it.
2. **Does startup fail fast when the child dies, or does it always wait out a
   fixed timeout?** A generic timeout message hides the actual error.
3. **Does the main process set `ELECTRON_RUN_AS_NODE=1` on anything it spawns
   via `process.execPath`?** (§1)
4. **Check the packaged output's `node_modules` directories on disk** - both
   the app's and `.next/standalone`'s. Is everything the entry script requires
   actually there? (§3, §8)
5. **Is a native binary sealed inside `app.asar`?** (§6)
6. **Read the app-data folder.** The log from §2 is there, along with the
   config and the database. On Windows it is
   `%APPDATA%/<productName>/`; print the path in the app somewhere so a user
   can find it without you.

## What a sandbox or CI machine cannot test

Be honest in writing about this, because the gap is where the bugs live:

- Nothing Windows-specific: `.cmd` resolution, certificate-store behaviour,
  NSIS installer behaviour, Windows path and file-locking rules. Windows
  refuses to rename a directory with open handles inside it, which changes the
  correct order of operations for anything that swaps a live data folder.
- The real installer path, if you can only build a Linux target locally.
- Process lifecycle: `app.relaunch()`, `before-quit` and window-close
  behaviour differ between dev and packaged runs.

The web UI itself *can* be tested headlessly, and should be - drive it with
Playwright against a real local database. A clean build is not evidence that
anything renders correctly; see `references/database-and-auth.md` §"Type
parsing" for a bug that was invisible to every test except a screenshot.

Mark such fixes "fixed as far as can be verified here" until someone confirms
on the target OS. The normal pattern is that the next problem appears a few
steps further in - that is progress, not a sign the previous fix was wrong.
