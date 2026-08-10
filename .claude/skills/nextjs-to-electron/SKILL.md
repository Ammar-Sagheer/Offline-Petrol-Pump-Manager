---
name: nextjs-to-electron
description: Convert a Next.js web app into an offline Windows/macOS/Linux desktop app packaged with Electron, with its own bundled database so it needs no internet, no Docker and no cloud account. Use this whenever someone wants a web app to "run offline", "work without internet", "run on one laptop", "be installed like a normal program", ship as a .exe/installer/desktop app, replace Supabase/Postgres-in-the-cloud with a local database, or bundle Postgres into an app - and also when debugging a packaged Electron build that works in dev but fails once installed (blank window, "Cannot find module", a server that never starts, a hanging electron-builder). Applies to any Next.js version using the App Router or Pages Router.
---

# Next.js to offline Electron desktop app

Turning a deployed web app into a desktop one is mostly not an Electron
problem. Electron is a window and a process manager; the hard parts are the
database that used to be someone else's problem, the authentication that used
to be a hosted service, and a packaging step whose failures only appear on a
machine that isn't yours.

The architecture that works, and that the pitfalls below all assume:

```
Electron main process
  ├─ 1. starts a bundled Postgres binary   (child process, 127.0.0.1 only)
  ├─ 2. spawns the Next.js standalone server (child process, 127.0.0.1 only)
  └─ 3. opens a BrowserWindow pointed at http://127.0.0.1:<port>
```

The app keeps being a Next.js app. Server Components, Server Actions and route
handlers all still work, because a real Next server is still running - it just
happens to be running on the user's laptop. **This is what makes the port
cheap:** if the data layer keeps its function names and return shapes, the
components and pages need no changes at all.

Shutdown runs that list backwards, so Postgres is always stopped cleanly. A
Postgres killed mid-write is what turns "backups are just a folder copy" into
a bad idea.

## Before writing any code, settle these

Ask the user rather than guessing - the answers change the whole shape of the
work, and two of them are hard to reverse later.

1. **Which machine, and who installs it?** One known Windows laptop is a very
   different job from "whoever downloads it". It decides whether you need code
   signing, auto-update, and how much the first-run experience has to explain.
2. **What is the database today?** Supabase or hosted Postgres is the good
   case: the schema, triggers, constraints and RPCs port to a local Postgres
   nearly verbatim. SQLite is *not* a drop-in replacement - see
   `references/database-and-auth.md`, which covers what is actually lost.
3. **Is it multi-user?** A single-user desktop app may not need row-level
   security or roles at all. Dropping them is a legitimate decision; forgetting
   them is not.
4. **Does data need to survive a lost laptop?** If yes, backup and restore is
   part of the job, not a follow-up - read `references/backup-and-restore.md`
   before designing the data folder, because where the secrets live determines
   whether a backup is restorable at all.
5. **How do updates reach the machine?** Hand-carried installer, or auto-update
   from a release feed. See `references/shipping-updates.md`.

Then check the app for things that assume a server it no longer has: absolute
URLs, `NEXT_PUBLIC_*` values baked in at build time, external auth callbacks,
webhooks, cron jobs, image optimisation against a remote loader, and anything
reading a cloud provider's environment variables.

## The conversion, step by step

Work in this order. Each step is verifiable on its own, and a later step's
failures are much harder to read if an earlier one is still broken.

### 1. Standalone build

```js
// next.config.mjs
export default {
  output: 'standalone',
};
```

`next build` then writes `.next/standalone/` - a self-contained server with its
own traced `node_modules` and a `server.js` that plain `node` can run. Electron
spawns *that*, never `next start`, which expects the full project tree.

Standalone deliberately omits static assets and `public/`, because a normal
deployment serves those from a CDN. There is no CDN here, so copy them in after
every build. `assets/copy-standalone-assets.js` does this; wire it to
`"postbuild"` in package.json. Symptom if skipped: the app loads with no CSS.

### 2. Main process

Start from `assets/main.js` and `assets/config.js`. Between them they cover the
startup order, the shutdown order, per-install secrets, and the two spawn
flags whose absence produces the most confusing failures in the whole project
(pitfalls 1 and 2 in `references/packaging-pitfalls.md` - read that file before
writing this, not after the packaged build misbehaves).

The per-install config (`assets/config.js`) generates random passwords and a
session secret on first run and stores them in the OS app-data folder, next to
the database. Nothing secret ships in the installer, and every install differs.

### 3. Database

`assets/bootstrap-db.js` starts a bundled Postgres, creates the cluster on
first run, applies pending migrations, and hands back the connection
environment for the Next child process. Read `references/database-and-auth.md`
for the migration runner, replacing hosted auth with a signed cookie plus a
Postgres session variable, and the two type-parsing differences that silently
render wrong data instead of throwing.

### 4. Packaging

`assets/build-config.json` is the electron-builder block, with a comment on
every non-obvious line. Compute the `files` list with:

```bash
node <skill-path>/scripts/runtime-deps.js
```

It scans `electron/` for what the main process actually requires, walks the
lockfile transitively, and prints the entries to paste in. Shipping all of
`node_modules` instead makes the build appear to hang for a very long time and
bloats the installer with packages `.next/standalone` already contains; hand-
trimming it gets transitive names wrong, which surfaces only as "Cannot find
module" from an installed app on someone else's machine.

### 5. Verify on the target OS

The failure mode of this whole task is a build that works in dev and dies once
installed. `references/packaging-pitfalls.md` ends with a checklist for exactly
that situation. The short version: **dev mode cannot test packaging.** Anything
Windows-specific (`.cmd` resolution, code-signing probes, NSIS behaviour, path
handling) has to be confirmed on Windows, and the first thing to build is a log
file, because a packaged GUI app has nowhere else to put an error.

## Reference files

Read the one that matches what you are doing rather than all of them.

| File | When to read it |
|---|---|
| `references/packaging-pitfalls.md` | Before writing the main process, and any time a packaged build behaves differently from dev. The six failures that cost real debugging time, each with its symptom, its cause and its fix. |
| `references/database-and-auth.md` | Choosing the local database, porting a schema off Supabase, replacing hosted auth, or hunting a bug where data renders wrongly but nothing throws. |
| `references/backup-and-restore.md` | Any app whose data only exists on one machine. Covers the two faults that make a backup silently unrestorable. |
| `references/shipping-updates.md` | Auto-update, releasing new versions, and keeping source private while installers are public. |

`assets/` holds working files to copy and adapt: `main.js`, `bootstrap-db.js`,
`config.js`, `copy-standalone-assets.js`, `preload.js`, `build-config.json`.
They are a starting point, not a library - read the comments and delete what
the app does not need.

## Things worth knowing before you are surprised by them

- **Bind everything to `127.0.0.1`.** Both the database and the Next server.
  On `0.0.0.0` the app is served to the whole network the laptop is on, which
  nobody asked for and no one would notice.
- **Pick fixed, uncommon ports** and store them in the per-install config. A
  random port each launch breaks nothing at runtime but makes every log and
  bug report harder to compare.
- **The window should not open before the server answers.** Poll it, and race
  that poll against the child process exiting, so a crash surfaces with its
  real error instead of after a blind timeout.
- **First run needs a way to create the first account.** A hosted-auth app
  usually leaned on a dashboard for this. Offline there is no dashboard, so a
  first-run setup screen is a new screen you have to build. It is the most
  commonly forgotten piece of the entire port.
- **Ship no secrets.** Anything in the installer can be unzipped by anyone who
  has it. Service-role keys, signing keys and API tokens do not belong in a
  desktop build; generate per-install secrets on the machine instead.
- **Decide what "reset the data" means** and write it down. Deleting the data
  folder is a much harder reset than a web app's "clear everything" button, and
  the difference matters to whoever is testing on real hardware.
