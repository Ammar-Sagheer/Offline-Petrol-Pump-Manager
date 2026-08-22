# Offline Petrol Pump Manager

Offline desktop port of `Ammar-Sagheer/Petrol-Pump-Management-Software`
(Next.js + Supabase web app). This is a **companion project in its own repo**
- never push to the reference repo, never modify it. It exists to read for
architecture and business logic only.

Read `PROGRESS.md` before starting work in a new session. It has the full
history: what's built, what's tested, every real bug found while running this
on the owner's actual Windows machine and how each was fixed, and what's
still open. This file (CLAUDE.md) is the short orientation; PROGRESS.md is
the detailed record.

Also here:
- `README.md` - how to run it, how to reset the data, how backup and restore
  work, plus a reusable Next.js-to-Electron packaging guide covering the
  pitfalls this project actually hit.
- `docs/RESTORE_FROM_BACKUP.md` - the in-app restore button: design, the
  constraints behind it, and what still needs verifying from a packaged
  install.
- `docs/LICENSING.md` - design only, not built. How to stop the app being
  copied to other pumps, and an honest account of what is and isn't
  achievable for an offline Electron app.
- `docs/LICENSING_PLAN.md` - the agreed spec built from that design: signed
  Ed25519 licence tokens issued by hand over WhatsApp, no server, ever. Read
  both before starting licensing work, and note its open questions are the
  owner's to answer, not ours to guess.

## What this is

Same app, same business rules, same UI - running entirely on one Windows
laptop with no internet dependency. Electron spawns a bundled Postgres binary
and the Next.js server as child processes, both bound to `127.0.0.1` only.
Closing the app stops both cleanly. Backing up is copying one folder.

## Locked-in architecture decisions (do not re-litigate without asking)

1. **Raw Postgres, no Docker, no Supabase.** The client should never need to
   install Docker Desktop. `embedded-postgres` bundles real Postgres binaries
   per-platform. GoTrue (Supabase Auth) is replaced by: `current_uid()`
   reading a Postgres session variable the app sets per request via
   `SET LOCAL app.current_user_id`, after checking a signed session cookie.
   `profiles` is the identity table itself (email + password_hash), not a
   shadow of a separate `auth.users`.
2. **Passwords are hashed and checked entirely in Postgres**, via pgcrypto's
   `crypt()`/`gen_salt('bf')` - never the `bcrypt` npm package. A password
   hash never has to leave the database, and it avoids a native-module
   rebuild step in Electron packaging.
3. **Electron, not Tauri.** Pure JS/Node main process, matches the plain-JS
   constraint everywhere else in the project.
4. **`asar: false` in electron-builder.** Native Postgres binaries can't be
   `chmod`'d reliably from inside an asar virtual archive - see PROGRESS.md's
   bug log for why this isn't optional.
5. **Plain JavaScript everywhere. No TypeScript.**

## Where things live (mirrors the reference repo's structure exactly)

- `db/migrations/001-034` - the entire data model. `001-009` is the original
  consolidation of the reference repo's first 21 Supabase migrations into
  their final state (not replayed step-by-step - Supabase-specific
  workarounds like the `safeupdate` library dance don't apply here);
  `010` onwards are ported one-for-one as the reference adds them, so
  `013-024` = reference `024-035`, `025-030` = reference `036/039-043`, and
  `032-034` = reference `044/046/047` (Treasury). The numbers never line up,
  and they are not meant to - compare *contents*, never numbers. Each file's
  header names the reference migration it came from and what had to change.
  Every trigger, constraint, and the full banking module carried over
  untouched in logic; only the identity plumbing changed - `auth.uid()`
  becomes `current_uid()`, `authenticated`/`anon` become `app_user`.
  `031` is offline-only (customizable nozzles - every install used to be
  hard-seeded with the same fixed layout, which doesn't fit every client's
  actual pump), with no reference counterpart, so it breaks the run of
  correspondences. Also skipped from the reference's Treasury run:
  `045` seeds one specific owner's real 36 cash transactions - private
  history for one client, not a generic starting point, so every install
  starts with an empty treasury instead; `048` repairs a mistake made when
  applying `044` to one specific *live* Supabase database - it never happened
  here, since a fresh embedded Postgres cluster gets `032` applied correctly
  the first time.
- `app/_lib/db.js`, `auth.js` - replace `supabase.js`/`supabase-server.js`/
  `supabase-auth.js`. Connection pooling, session cookies (iron-session),
  the `withUser(userId, fn)` helper every read/write goes through.
- `app/_lib/data-service.js`, `actions.js` - mechanical port to the `pg`
  driver, same function names/shapes as the reference app, which is why the
  ~40 admin components and ~27 page routes are copied across verbatim. That
  is the whole point of keeping the names identical: when the reference
  moves, the sync is a file copy for everything except these two files and
  the handful listed under "The one deliberate UI difference" in
  PROGRESS.md.
- `electron/` - `main.js` (window + child process lifecycle), `bootstrap-db.js`
  (starts Postgres, runs pending migrations, mints the `app_user` password),
  `config.js` (per-install secrets in the OS app-data folder).
- `app/admin/setup/` - first-run owner account creation (new; the reference
  app never needed this since Supabase Auth handled signup).
- `app/admin/backup/` - copies the data folder safely while the app keeps
  running, via Postgres's own `pg_backup_start()`/`pg_backup_stop()` (new).
- `app/_components/ui/AppTheme.js` + the `AppRouterCacheProvider` in
  `app/layout.js` - Material UI's Emotion cache. The icon set is MUI's, and
  without this wrapper every icon hydrates mismatched.

## Commands

```bash
npm install              # also downloads platform Postgres binaries
npm run electron:dev     # fastest loop - Next dev server inside Electron
npm run build             # next build + copy static assets into standalone
npm run electron           # production-mode Electron, no installer
npm run dist                # electron-builder installer (see PROGRESS.md
                             # for Windows-specific gotchas already fixed)
```

## Non-negotiables from the original brief

- The **database**, not application code, is the source of truth for money
  correctness. No double-counted sales, no editable past ledger entries, no
  deletable evidence of debt, no bank account going negative - regardless of
  what the JavaScript does. Verify any schema change against this.
- Match the reference repo's project structure and coding conventions
  exactly - same file layout, same comment voice (short blocks explaining
  *why*, not narrating *what*).
