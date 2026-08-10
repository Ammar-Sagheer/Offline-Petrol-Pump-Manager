# Skills

Two reusable skills, written from what this project actually learned rather
than from general knowledge. They live here so they are version-controlled and
travel with the repo, but both are meant for **other** projects too - see
"Using them everywhere" below.

## `nextjs-to-electron`

Converting any Next.js app into an offline desktop app with its own bundled
database. Triggers on things like "make this run offline", "package it as a
.exe", "bundle Postgres", or a packaged Electron build that works in dev and
fails once installed.

It carries the whole bug log from `PROGRESS.md` as a diagnostic reference -
`ELECTRON_RUN_AS_NODE`, `stdio: 'inherit'` in a GUI app, the
`includeSubNodeModules` gate that silently deletes `.next/standalone/
node_modules`, `npx.cmd`, ESM-only requires, `asar: false`, the signtool hang -
each with its symptom first, since that is what a stuck reader has in hand.

`assets/` holds working copies of `main.js`, `bootstrap-db.js`, `config.js`,
`copy-standalone-assets.js`, `preload.js` and the electron-builder block,
generalised off this repo's own.

`scripts/runtime-deps.js` computes the electron-builder `files` list by walking
the lockfile from whatever `electron/` actually requires. Run it from a project
root:

```bash
node .claude/skills/nextjs-to-electron/scripts/runtime-deps.js
```

Checked against this repo, it reproduces the hand-built list and is more
accurate on one point: `electron-updater`'s `fs-extra` and `semver` are nested
copies that ride along inside its own folder, not the hoisted top-level ones
the manual list named.

## `project-docs`

Scans a repo and writes or refreshes `CLAUDE.md`, `README.md`,
`docs/CHANGELOG.md`, `docs/UI_CONVENTIONS.md` and `PROGRESS.md`, in the voice
these two repos already use.

The structure of each file is taken from the reference repo's own docs, which
is why the output should drop straight into a project set up like this one. It
has a section on writing upstream docs specifically so a downstream port can
replay changes from them - the "where things stand" block, migration-level
detail, and the warning that consolidated migration numbers never line up with
the original's.

## Using them everywhere

As they are, these load only for sessions working in this repo. To have them
available in every project, copy them into your personal skills folder:

```bash
# macOS / Linux
cp -r .claude/skills/nextjs-to-electron .claude/skills/project-docs ~/.claude/skills/

# Windows PowerShell
Copy-Item -Recurse .claude\skills\nextjs-to-electron,.claude\skills\project-docs $HOME\.claude\skills\
```

Re-copy after changing anything here, or keep only the personal copies and
treat these as the reference version.

## Changing them

The `skill-creator` skill covers the format and has an evaluation loop for
testing a change against real prompts. The thing most worth preserving in both
skills: every instruction says *why*, because the failures they describe are
counter-intuitive enough that a rule with no reasoning gets overridden by the
next plausible-looking idea.
