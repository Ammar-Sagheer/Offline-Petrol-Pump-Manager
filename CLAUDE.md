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

- `db/migrations/001-009` - the entire data model, consolidated from the
  reference repo's 21 Supabase migrations into their final state (not
  replayed step-by-step - Supabase-specific workarounds like the
  `safeupdate` library dance don't apply here). Every trigger, constraint,
  and the full banking module carried over untouched in logic; only the
  identity plumbing changed.
- `app/_lib/db.js`, `auth.js` - replace `supabase.js`/`supabase-server.js`/
  `supabase-auth.js`. Connection pooling, session cookies (iron-session),
  the `withUser(userId, fn)` helper every read/write goes through.
- `app/_lib/data-service.js`, `actions.js` - mechanical port to the `pg`
  driver, same function names/shapes as the reference app, which is why the
  ~30 admin components and ~25 page routes needed zero changes.
- `electron/` - `main.js` (window + child process lifecycle), `bootstrap-db.js`
  (starts Postgres, runs pending migrations, mints the `app_user` password),
  `config.js` (per-install secrets in the OS app-data folder).
- `app/admin/setup/` - first-run owner account creation (new; the reference
  app never needed this since Supabase Auth handled signup).
- `app/admin/backup/` - copies the data folder safely while the app keeps
  running, via Postgres's own `pg_backup_start()`/`pg_backup_stop()` (new).

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
