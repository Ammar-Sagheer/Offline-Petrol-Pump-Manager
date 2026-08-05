# Restore from a backup, from inside the app

**Status: designed, not built.** This is a handoff document for whoever picks
this up - ideally in a session running on the owner's actual Windows machine,
where the packaged app can be launched and watched. Nothing here has been
implemented; the file paths and function names below are real and current.

## The problem this solves

Backing up is one button (`app/admin/backup`). Restoring is four manual
steps: install the app, open it once, delete `db-data` and `config.json`,
copy the backup's versions in their place. Those steps are written on the
Backup page and in `README.md`, and they work - but they get performed on a
freshly reinstalled machine, by someone who has just lost a laptop, and who
is not in the mood to read carefully. That is exactly when a hand-typed
folder operation goes wrong.

## Decision 1: a folder picker, not a file upload

The obvious framing - "let the user upload their backup" - does not fit.

A backup is not a file. `backups/<timestamp>/` contains `config.json` plus a
whole `db-data/` tree: hundreds of files across `base/`, `global/`, `pg_wal/`
and a dozen other subdirectories. Pushing that through an HTML file input
means thousands of parts through a Server Action whose body limit is 1 MB
(`next.config.mjs`), and it is pointless work regardless: this is a desktop
app, and the files are already on the same machine the app is running on.
Uploading them would mean copying a folder to itself the long way round.

Use Electron's native directory picker instead:

```js
const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
  title: 'Choose the backup folder to restore',
  properties: ['openDirectory'],
});
```

The owner browses to the folder on their USB drive. Nothing is uploaded, and
the OS file dialog is a thing they already know how to use.

## Decision 2: the work happens in the Electron main process

This is the constraint that shapes everything else, and it is not negotiable.

**You cannot replace a Postgres data directory from a process that depends on
that database.** A Server Action in `app/_lib/actions.js` runs inside the
Next.js child process. Before it could do anything it calls `requireRole()`,
which reads the session from Postgres. To restore, it would have to stop the
very server it just authenticated against, overwrite the directory that
server is running from, and then return a response to a page that can no
longer be rendered. It would be sawing off the branch it is sitting on.

There is a second reason: restoring `config.json` changes `pgPort`,
`nextPort`, `sessionSecret` and both database passwords. Those were passed to
the Next.js child as environment variables when it was spawned
(`startNextServer(env)` in `electron/main.js`). The child cannot adopt new
ones; it has to be restarted.

So the sequence belongs in `electron/main.js`, which already owns both child
processes and already has `shutdown()` to stop them in the right order.

## Decision 3: there is no IPC channel yet - one has to be added

Today the two processes only communicate one way, at startup:
`electron/main.js` spawns the Next server with credentials in its
environment, and pipes its stdout/stderr to `next-server.log`. The window is
a plain `loadURL()` of `http://127.0.0.1:<port>` with
`contextIsolation: true` and `nodeIntegration: false` - which is correct and
should stay that way.

Two workable options:

**A. Preload script (recommended).** Add a preload to the `BrowserWindow`
that exposes exactly one function over `contextBridge`:

```js
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pumpManager', {
  restoreFromBackup: () => ipcRenderer.invoke('restore-from-backup'),
});
```

The Backup page's restore button is a Client Component, so it can call
`window.pumpManager?.restoreFromBackup()` directly - and the absence of that
object is also how the page knows it is not running inside Electron, which
is a cleaner check than the current `APP_DATA_DIR` env sniff.

Keep the bridge to this one call. Do not expose `ipcRenderer` itself, and do
not turn on `nodeIntegration` - the renderer loads a full Next.js app, and
widening its privileges for one button is a bad trade.

**B. A loopback HTTP endpoint in the main process.** Main listens on another
`127.0.0.1` port; the page POSTs to it. Avoids a preload script, but adds a
second listening socket and its own auth question. Option A is less surface.

## The restore sequence

In `electron/main.js`, roughly:

1. **Confirm intent in the renderer first** (see "Safety" below) - the main
   process should only be asked once the user has really committed.
2. `dialog.showOpenDialog` for the backup folder. Bail on cancel.
3. **Validate the chosen folder** before touching anything:
   - `db-data/PG_VERSION` exists (it is a real cluster, not a random folder)
   - `config.json` exists and `JSON.parse`s, with `pgPort`, `appUserPassword`
     and `sessionSecret` present
   - Fail with a clear message naming what was missing. Someone picking the
     wrong folder is the likeliest failure, not a corrupt backup.
4. **Snapshot what is there now, before overwriting it.** Rename the live
   `db-data` and `config.json` aside (e.g. `db-data.replaced-<stamp>`) rather
   than deleting them. If the restore fails halfway, this is the only way
   back. **This step is not optional** - the whole operation is "overwrite
   the real data with something from a USB drive", and the failure mode is
   permanent.
5. `await shutdown()` - stops the Next child, then the Postgres child, in
   that order (it already does this correctly).
6. Copy `db-data` and `config.json` from the backup into place.
   `fs.cp(..., { recursive: true })`. Do **not** carry across
   `postmaster.pid` / `postmaster.opts` if an older backup contains them -
   Postgres refuses to start from a folder that has one. See bug #10 in
   `PROGRESS.md`.
7. `app.relaunch(); app.exit(0);` - a clean restart re-runs
   `bootstrapDatabase()` against the restored folder, reads the restored
   `config.json`, and spawns the Next server with the matching credentials.
   Simpler and far more predictable than trying to re-wire the running app.
8. On any failure after step 4: put the snapshot back, then report. The user
   should end up either fully restored or exactly where they started, never
   in between.

## Safety

This button overwrites live financial data. Treat it like the reset action,
which already has the right pattern - see
`app/_components/admin/FullResetPanel.js`:

- Behind a `<Dialog>`, triggered by a `.btn-danger` button.
- Requires the owner's password **and** a typed confirmation word.
- `requireRole(ROLES.SUPER_ADMIN)` on the server side of that check.

Note the ordering problem: the password check needs the database, and the
restore destroys it. So do the confirmation **first**, as a normal Server
Action that verifies the password against the current database, and only
then hand off to the main process. Do not try to verify anything after
step 5.

Also worth surfacing in the UI, because it will confuse someone otherwise:
after a restore the app will ask them to sign in again, with the **password
from the backup**, not whatever they had set up on the fresh install. The
`profiles` and `sessions` tables come from the backup like everything else.

## Files this touches

| File | Change |
|---|---|
| `electron/main.js` | `ipcMain.handle('restore-from-backup')`, the sequence above, `preload` in `webPreferences` |
| `electron/preload.js` | new - the one-function context bridge |
| `electron/config.js` | already exports `userDataDir()`, `dbDataDir()`, `configPath()` - no change expected |
| `app/admin/backup/page.js` | replace the written-out restore steps with the button (keep them as a fallback for anyone not inside Electron) |
| `app/_components/admin/RestoreButton.js` | new - dialog, password + typed confirmation, then `window.pumpManager.restoreFromBackup()` |
| `app/_lib/actions.js` | new action that verifies the owner's password before the handoff |
| `README.md` | update the restore section once the button exists |

## Testing this properly

Most of it can only be judged from a real packaged build:

- **It must be tested from an installed `.exe`, not `npm run electron:dev`.**
  Every packaging bug in this project's history (see `PROGRESS.md` bugs #5,
  #6, #9) was invisible in dev mode. `app.relaunch()` in particular behaves
  differently packaged versus unpacked.
- Test the unhappy paths, not just the happy one: cancel the picker; choose a
  folder that is not a backup; choose a backup missing `config.json`; make
  the copy fail partway (a read-only destination will do) and confirm the
  snapshot rollback actually restores the previous state.
- Confirm the app comes back up signed **out**, and that the backup's own
  owner password works.
- Confirm an *older* `db-data`-only backup is rejected with a message that
  says what to do, rather than half-restoring.

One technique worth knowing, from bug #10: the backup action was verified
without a packaged build by pointing `APP_DATA_DIR`, `DB_DATA_DIR` and
`PG_BACKUP_*` at a hand-built folder and running `next start`. The *validation*
and *copy* logic here can be exercised the same way. The process
lifecycle - `shutdown()`, `app.relaunch()` - cannot.

## Open questions for whoever builds this

- **Keep the snapshot, or delete it after a successful restore?** Keeping it
  is safer and costs disk (the database is the biggest thing in the folder).
  Suggestion: keep it, surface it on the Backup page as
  "replaced on <date>", let the owner delete it deliberately.
- **Restore from the in-app list too?** The Backup page already lists
  `backups/<timestamp>/` folders. Restoring one of those with a click - no
  file dialog at all - is the more common case (undoing a bad day's entry),
  while the folder picker covers the new-machine case. Both use the same
  main-process sequence.
- **Should the reset button come back at the same time?** `reset_all_data()`
  exists and is fully wired, gated on `ALLOW_FULL_RESET`, which
  `electron/bootstrap-db.js` never passes. It was deliberately left off
  (see `README.md`), but "restore" and "reset" are neighbours conceptually
  and the owner asked about both. Worth deciding together rather than twice.
