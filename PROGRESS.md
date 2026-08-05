# Progress log

Read `CLAUDE.md` first for orientation. This file is the detailed history:
what's built, what's been verified and how, every real bug hit while running
this on the owner's actual Windows machine, and what's still open.

Branch: `claude/offline-petrol-pump-desktop-8ktct0` on
`Ammar-Sagheer/Offline-Petrol-Pump-Manager`.

Reference repo (read-only, do not push to it):
`Ammar-Sagheer/Petrol-Pump-Management-Software`, `main` branch. **It now has
its own `CLAUDE.md`, `docs/UI_CONVENTIONS.md` and `docs/CHANGELOG.md` - read
those before any UI work here.** The offline app is meant to be visually and
behaviourally identical to it, so its design decisions are this repo's design
decisions; the UI was last synced to its commit `1de9266`.

**The one deliberate UI difference:** the login page redirects to
`/admin/setup` when no profile exists. A reset database has no owner account
and no Supabase dashboard to create one from, so the offline app has to be
able to make the first one itself.

## Collaborators

This is not a solo branch. `owaisikhan` fixed the three bugs that stopped the
packaged `.exe` from starting (bug #9 below), on
`fix/packaged-app-fails-to-start`, and added `README.md` - a reusable
Next.js-to-Electron packaging guide worth reading before touching
`electron/` or the `build` block in `package.json`. That branch is merged
into this one. Check for other branches before assuming this one is current.

## Status: all 8 build tasks complete, currently fixing packaging bugs found on real hardware

The app runs. The owner has gotten as far as: install → first-run setup →
signed-in dashboard → sign out, on his real Windows machine via
`npm run electron:dev`. We are now iterating on `npm run dist` (the packaged
installer), which has hit several Windows-specific bugs the dev-mode path
didn't surface. See "Bug log" below - that's the part most worth reading
before assuming something is done.

## What's built

1. **Data model** (`db/migrations/001-009`) - full port of the reference
   app's 21 migrations, consolidated to final state. Every trigger,
   constraint, deferred check, and the full banking module (60-entry cap,
   per-account overdraw guard, split-payment RPC) carried over. Identity
   rewired: `auth.uid()` → `current_uid()` (reads a session var the app
   sets), `profiles` is now the identity table (email + password_hash),
   passwords hashed/checked entirely in Postgres via pgcrypto.
2. **Node/Electron glue** (`app/_lib/db.js`, `auth.js`, `electron/*`) -
   connection pooling with per-request `SET LOCAL`, iron-session cookies,
   Electron bootstrapping embedded Postgres and running migrations on first
   launch.
3. **Full UI port** - `data-service.js`/`actions.js` mechanically ported to
   `pg`, same function signatures as the reference app. No component or page
   needed to change - they only ever called these two files by name.
4. **New screens**: `app/admin/setup` (first-run owner creation),
   `app/admin/backup` (safe live copy of the data folder via
   `pg_backup_start()`/`pg_backup_stop()`).

## How each piece was verified

- All 9 migrations applied cold against a real Postgres 16 instance.
- RLS proven to actually block a `data_entry` login from `expenses`.
- The append-only ledger trigger proven to block even the table-owner role
  (not just `app_user` via RLS) - the scenario the original design doc
  specifically called out as the reason the trigger exists at all.
- `db.js`'s `withUser()`/`SET LOCAL` plumbing exercised directly against a
  live database: `create_first_owner` → `verify_login` → RLS-scoped queries
  all round-tripped correctly.
- `node .next/standalone/server.js` (the exact process Electron spawns in
  production) started against a fresh database and served real HTTP
  requests - login page rendered, static CSS resolved, a database with no
  profiles correctly redirected to `/admin/setup`.
- The packaged Linux build (`electron-builder --linux dir`) run under Xvfb
  in this sandbox, confirming the `asar: false` fix actually puts the
  Postgres binaries somewhere `chmod` can reach.
- Beyond the above, **the owner has run this for real on Windows** and that's
  where most of the bugs below were actually found - dev-mode testing here
  did not and could not catch several of them (see "What this sandbox can't
  test" below).

## Bug log (chronological, all on real hardware unless noted)

Each of these was a real failure the owner hit, not a hypothetical - read
this before assuming a step "just works."

1. **`ERR_REQUIRE_ESM` on `embedded-postgres`.** It ships as ESM-only;
   `require()` from Electron's CommonJS main process fails. Fixed with a
   dynamic `import()` inside `bootstrapDatabase()`.
2. **`syntax error at or near "$1"` on first run.** `ALTER ROLE ... PASSWORD
   $1` is invalid - that clause's grammar takes a string literal, not a bind
   parameter, no matter what value is bound. Fixed by asking Postgres to
   `quote_literal()` the password first (parameters ARE allowed in a plain
   `SELECT`), then interpolating the already-escaped result. Verified with a
   deliberately adversarial password containing a quote and a semicolon.
3. **`spawn npx ENOENT`** in `electron:dev` on Windows. `npx` is `npx.cmd`
   there; plain `child_process.spawn` can't execute it without `shell: true`
   (which brings cross-platform quoting problems of its own). Fixed by
   resolving Next's CLI script with `require.resolve('next/dist/bin/next')`
   and running it directly with `node` - no shell, no PATH lookup, works
   identically on every OS.
4. **Setup screen reappeared after signing out.** `anyProfilesExist()` (the
   check the login page uses to decide login-form vs. setup-redirect)
   queried `profiles` directly. That table's RLS policy only allows reading
   your own row or, as `super_admin`, every row - neither applies when
   signed out, so `current_uid()` is null and RLS hides every row including
   the owner's. Looked identical to a fresh install. Fixed with
   `any_profiles_exist()` (migration 009), a `SECURITY DEFINER` function in
   the same family as `verify_login()`/`create_first_owner()` - answers one
   narrow yes/no question without needing RLS to let a signed-out request
   through. Verified: `false` before any owner exists, `true` after, with no
   session at all.
5. **Installer: `postgres.exe` `ENOENT`/`chmod` failure on first launch.**
   Two compounding causes:
   - electron-builder's `files` list named specific project folders but
     never `node_modules`, so `embedded-postgres` and its platform-specific
     `@embedded-postgres/<platform>` binary package were left out of the
     installer entirely.
   - Once `node_modules` was included, a *second* failure appeared: `chmod
     ENOTDIR` on a path inside `app.asar`. `asar` packs the app into a
     virtual filesystem archive; `chmod` can't operate on a file living
     inside it, and `embedded-postgres`'s own path resolution doesn't
     reliably follow Electron's asar-unpack redirection. Fixed by disabling
     asar packaging entirely (`asar: false`) rather than chasing
     `asarUnpack` glob patterns file-by-file - everything becomes real files
     on disk, so no native binary's path resolution needs to know it's
     running from inside a packaged app.
   - Verified by actually building and running the packaged Linux app under
     Xvfb in this sandbox: confirmed `postgres`/`initdb` present and
     executable outside any archive.
6. **`npm run dist` hangs indefinitely** right after
   `signing with signtool.exe path=...elevate.exe`. electron-builder calls
   `signtool.exe` to probe for a code-signing certificate on every packaged
   binary; `signtool` enumerating the Windows certificate store is a
   well-known cause of electron-builder hanging forever when no real
   certificate is configured. Fixed with `win.signAndEditExecutable: false`
   plus `CSC_IDENTITY_AUTO_DISCOVERY=false` (electron-builder's own
   documented escape hatch) on the `dist` script.
7. **`npm run dist` looked stuck again** after fix #6, sitting at the NSIS
   build step (`building target=nsis file=...`) with no further output for a
   long time. Not actually a hang this time - the `files` list included all
   of `node_modules` (the fix for bug #5), which includes `next`, `react`,
   Tailwind and everything else, most of it already duplicated inside
   `.next/standalone` by Next's own dependency tracing. `electron/*.js` only
   ever directly `require`s two third-party packages at runtime: `pg` and
   `embedded-postgres`. Computed the real transitive closure for those two
   from `package-lock.json` programmatically (hand-guessing package names
   got two of them wrong the first time - see the commit) and trimmed
   `files` to just that set, cutting the packaged `node_modules` down to
   ~59MB. Verified the trimmed set is genuinely complete by constructing a
   real `pg.Client` from a directory copied fully outside the source tree
   (so Node's module resolution can't cheat by walking up into the
   project's own `node_modules`) - that's the exact code path
   `bootstrap-db.js` exercises, and it succeeded.
8. **Every date in the app rendered as
   `Mon Aug 03 2026 00:00:00 GMT+0000 (Coordinated Universal Time)`.** Found
   by screenshotting the UI during the design sync, not by any test - the
   build was clean and nothing threw. Supabase returned DATE columns over
   JSON as `'YYYY-MM-DD'` strings, which is what `formatDate()` in
   `date-helpers.js` was written against (it slices the first 10 characters
   and splits on `-`). The `pg` driver instead parses DATE into a JS `Date`,
   and `String(thatDate)` slices to `'Mon Aug 03'`, which splits to nothing
   numeric, so formatDate fell through to printing the whole thing. The same
   mismatch silently left every `<input type="date">` blank (Settings' tank
   opening-stock dates), and the oversized date column pushed the Purchases
   table's Supplier column into wrapping across three lines - a second,
   purely visual symptom whose real cause was this. Fixed at the driver
   boundary in `app/_lib/db.js` with
   `types.setTypeParser(types.builtins.DATE, (v) => v)`, restoring the
   string contract the ~37 date-column usages across the UI already assume,
   rather than teaching each of them a second possible shape. `timestamptz`
   (`created_at`) is deliberately left as a `Date`: it is a real instant,
   and its one usage only compares two of them.

   **Worth generalising from:** this is the class of bug the Supabase →
   `pg` port is most likely to still be hiding - places where PostgREST's
   JSON serialisation and the `pg` driver's type parsing disagree about a
   column's JavaScript shape, with no error raised either way. `numeric`
   is the other one to watch (pg returns it as a string to protect
   precision); the app mostly wraps those in `Number()` already, but it has
   not been audited column by column.
9. **The packaged `.exe` installed and launched, but the window never
   appeared - it timed out after 30s waiting for a server that never
   started.** Found and fixed by `owaisikhan` on
   `fix/packaged-app-fails-to-start` (merged here). Three compounding
   causes, none reproducible from `electron:dev` or from running
   `.next/standalone/server.js` with plain `node` - which is exactly why my
   own testing missed all three:
   - `spawn(process.execPath, [serverPath])` needs `ELECTRON_RUN_AS_NODE=1`.
     `process.execPath` is the Electron binary; without that flag a packaged
     `.exe` (whose entry point is baked in) just relaunches the whole app
     recursively instead of running `server.js`.
   - `stdio: 'inherit'` is unsafe in a packaged Windows app: it is a
     GUI-subsystem executable with no console, so the main process's own
     stdout/stderr are not valid handles to hand a child. Now piped to
     `next-server.log` in the app-data folder, and startup races against the
     child dying so a crash surfaces immediately with the log tail instead
     of after a blind 30s wait.
   - electron-builder treats **any** directory named `node_modules`, nested
     or not, as a hard gate evaluated before individual file patterns - so
     it silently deleted `.next/standalone/node_modules` (Next's own bundle
     of next/react/etc for the standalone server) despite
     `.next/standalone/**/*` being listed. Fixed with
     `includeSubNodeModules: true`, and by moving `.next/standalone/**/*`
     after the `!node_modules/**/*` negation in the `files` list, since
     order matters there. **My node_modules trimming in bug #7 is what
     exposed this** - worth remembering that the `files` list is far more
     order- and gate-sensitive than it looks.
10. **A backup could not actually be restored.** Found by asking the obvious
    question nobody had asked - "the laptop got wiped, now what?" - and then
    testing it rather than reasoning about it. Two independent faults, both
    of which made the folder useless on a different machine:
    - `createBackup` copied only `db-data`, not `config.json`. Postgres
      stores its role passwords **inside the cluster**, and `config.json` is
      the only record of what they are. A fresh install generates new random
      ones, so a restored `db-data` sat there intact and unreachable:
      `password authentication failed for user "postgres"`. Now both are
      copied, and `config.json` keeps its 0600 mode.
    - A copy taken while the server runs necessarily includes
      `postmaster.pid` and `postmaster.opts`. Postgres then refuses to start
      from the restored folder (`lock file "postmaster.pid" already exists
      ... is another postmaster running`) because it cannot distinguish a
      stale pid from a live one. Both are now filtered out of the copy; they
      are regenerated on every start.

    Verified by running the real action through the app, then restoring the
    resulting folder onto a simulated fresh install (different random
    passwords in its own `config.json`): Postgres started with no manual
    fixing, both roles authenticated, and the customers and logins were
    intact. Restore steps are on the Backup page itself, deliberately -
    whoever needs them is on a reinstalled machine with no project checkout.

    **Older backups, taken before this fix, contain only `db-data`.** They
    are recoverable but need the `pg_hba.conf` → `trust` → reset both
    passwords → restore `pg_hba.conf` dance, which is written up in
    `README.md`. That path was tested too, and works.

**Current point in the loop:** waiting on the owner to re-run `npm run dist`
with fix #7 and report whether the build now completes in reasonable time
and the packaged app actually launches successfully end-to-end (through
setup, to a working dashboard). That full path has not yet been confirmed
working from a real installed `.exe` on Windows - only from `electron:dev`
(dev-mode, not packaged), from `node .next/standalone/server.js` run
directly (not through Electron/the installer), and from the packaged Linux
build tested in this sandbox (which hits an unrelated, sandbox-only failure
after the point these fixes address - see below).

## What this sandbox can't test (why bugs keep surfacing on the owner's machine)

This session runs in a headless Linux cloud sandbox with no display and runs
as root. That has meant:
- No real Electron window has ever been opened by Claude in this session -
  everything Electron-shaped was verified either via Xvfb + `--no-sandbox`
  (a root-only workaround) or by testing the underlying Node/Postgres logic
  directly and trusting the wiring.
- **The web UI itself, however, CAN be tested here properly**, and should be.
  Playwright plus the pre-installed Chromium
  (`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`,
  launch with `--no-sandbox`, never run `playwright install`) drives the app
  against a real Postgres instance fine. That is how bug #8 was found, and it
  would not have been found any other way - the build was clean and nothing
  threw. Screenshot at 1440/1152/400px with realistic fixture data, per the
  reference repo's `docs/UI_CONVENTIONS.md`. Install Playwright with
  `npm install --no-save playwright` and keep the throwaway script out of
  git, the same way that repo treats `app/devcheck/`.
- Nothing Windows-specific has ever been tested here (`npx.cmd` resolution,
  `signtool.exe`/certificate store behavior, NSIS installer behavior,
  Windows path handling). Every Windows-only bug in the log above was found
  by the owner running the real thing, not by testing in this session.
- `npm run dist` has been run here only for the Linux target, to check file
  inclusion and the asar fix - never for the actual Windows NSIS installer
  path, which is what the owner is building.

**Practical implication for a new session:** don't mark a Windows-path bug
"fixed" as more than "fixed as far as we can reason about it and verify
adjacent logic here" until the owner confirms it on his machine. The pattern
so far has been: fix something, the owner hits the *next* problem a few
steps further in - that's expected, not a sign the previous fix was wrong.

## What's not yet done / worth knowing about

- **In-app restore button: designed, not built** -
  `docs/RESTORE_FROM_BACKUP.md` has the full design, the constraints that
  force it into the Electron main process rather than a Server Action, the
  files it touches, and what has to be tested from a real packaged `.exe`.
  Deliberately left for a session running on the owner's own machine, since
  it touches process lifecycle (`shutdown()`, `app.relaunch()`) which does
  not behave the same in `electron:dev` - the same blind spot that produced
  bugs #5, #6 and #9.

- No app icon configured for electron-builder, so the installer and window
  use the default Electron icon. The artwork exists (`app/icon.png`,
  `brand/`) - it just needs wiring into the `build` config in
  `package.json`. Cosmetic, but it is the last obviously-unfinished thing
  about the packaged app.
- Backup/restore has now been run end to end (see bug #10) by pointing the
  app at a hand-built app-data folder rather than waiting for the packaged
  build - `APP_DATA_DIR`/`DB_DATA_DIR`/`PG_BACKUP_*` are just env vars, so
  the real `createBackup` action can be exercised from `next start`. Worth
  remembering as a technique: several "only works in the packaged app"
  features can be tested this way.
- No full manual QA pass through every admin screen has happened on a real
  running **Windows** instance yet - once the installer launches cleanly,
  that's the natural next step. (Every screen has now been checked in this
  sandbox - see the QA pass below - but that is the web UI against Linux
  Postgres, not the packaged Windows app.)
- `npm run dist` cannot be completed **for the Linux target** in this
  sandbox: electron-builder fails with
  `ENOENT ... stat 'libecpg.so.6.17'` on the relative symlinks inside
  `@embedded-postgres/linux-x64`. Windows is unaffected (that package ships
  `.dll`s, no symlinks) and has packaged successfully, so this is a
  sandbox-only limitation, not a bug to fix.

## Full UI QA pass (every screen, in this sandbox)

Done after the design sync, against a real Postgres instance seeded through
the **actual RPCs and triggers** (6 days of readings across all 6 nozzles
via `create_nozzle_reading`, credit slips auto-posting to the ledger, a
customer payment, stock dips, deliveries, expenses, two bank accounts and a
payment through `record_bank_payment`).

Every admin screen screenshotted at 1440 / 1152 / 400px and inspected:
dashboard, readings, purchases, stock-checks, customers, customer detail
(ledger), new customer, banking, reports, settings, account, backup, plus
the delivery / nozzle-wiring / staff-login dialogs and the collapsed
password section. Each capture was also asserted against raw
`Date.toString()` leaking through, `[object Object]`, `undefined`/`NaN`, a
Next error boundary, and page-level horizontal overflow. **All clean.**

Arithmetic was checked against the seed rather than just eyeballed:
- Banking: 1,500,000 opening + 670,000 in − 380,000 out = 1,790,000 shown. ✓
- Customer ledger: 6 credit slips (3 × 40L @ 274.00 + 3 × 40L @ 278.25 =
  66,270) − 30,000 payment = 36,270 shown. ✓ Confirms the credit-sale →
  ledger trigger and the append-only payment path both work end to end.
- Stock: seeded dips of −140 / +60 show as exactly that gain/loss. ✓

Also verified:
- **Role enforcement**: a `data_entry` login sees only its four nav
  sections, gets no owner-only actions, and is *redirected away* from
  `/admin/reports` rather than shown it.
- **The monthly Excel export**, which had never been run: downloads a real
  16KB xlsx (valid ZIP magic, `pump-report-2026-08.xlsx`), 10 sheets,
  charts intact, figures matching the Reports page exactly.

What this pass does **not** cover: writing through the UI (every mutation
path was exercised via SQL/RPC, not by filling in forms and submitting), and
anything Windows- or Electron-specific.
