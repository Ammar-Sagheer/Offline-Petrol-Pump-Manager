# Progress log

Read `CLAUDE.md` first for orientation. This file is the detailed history:
what's built, what's been verified and how, every real bug hit while running
this on the owner's actual Windows machine, and what's still open.

Branch: `claude/offline-petrol-pump-desktop-8ktct0` on
`Ammar-Sagheer/Offline-Petrol-Pump-Manager`.

Reference repo (read-only, do not push to it):
`Ammar-Sagheer/Petrol-Pump-Management-Software`, `main` branch.

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

- No `logo.png` in `public/` - `BrandMark` falls back to initials gracefully,
  cosmetic only.
- No app icon configured for electron-builder (uses the default Electron
  icon) - cosmetic, low priority.
- The Backup screen (`app/admin/backup`) has never been exercised against a
  packaged app - the `pg_backup_start()`/`pg_backup_stop()` logic was
  verified as valid Postgres usage but not run end-to-end from the UI.
- No full manual QA pass through every admin screen (readings, purchases,
  stock checks, customers, banking, reports, settings) has happened on a
  real running instance yet - once the installer launches cleanly, that's
  the natural next step.
