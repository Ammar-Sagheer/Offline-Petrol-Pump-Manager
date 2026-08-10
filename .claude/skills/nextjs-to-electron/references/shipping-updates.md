# Shipping updates to an installed app

## Keeping source private while installers are public

`electron-updater` reads its update feed from a GitHub release. A private repo
needs a token on every client to read that feed, and a token shipped inside an
installer is not a secret. The way out is two repositories: the source stays
private, and a second **public repo holds nothing but built installers**.

```json
"publish": {
  "provider": "github",
  "owner": "your-name",
  "repo": "your-app-releases",
  "releaseType": "release"
}
```

Be honest about what this trades away: anyone with the URL can download the
installer. If the app is licensed per site, that is a real hole, and it is an
access-control problem to solve inside the app rather than by hiding the link.

## Publishing

```json
"dist":    "npm run build && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder",
"release": "npm run build && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --publish always"
```

`dist` builds an installer locally; `release` also uploads it. The publishing
token lives in the developer's own shell (`GH_TOKEN`), never in the repo and
never in the app.

**Bump `version` in package.json before every release.** electron-updater
compares that against what is installed, so a build without a version bump is
invisible to every client - and the symptom is silence, not an error.

Installing over an existing version needs no uninstall: NSIS handles it for a
matching `appId`, whether or not auto-update was involved.

## Behaviour that suits an offline app

The whole premise is that this app works with no internet. The update check
must therefore treat "no connection" as a completely normal outcome:

- **Never show a dialog for a failed check.** Log it to a file and move on.
  Only a *successful download* earns an interruption.
- **Delay it** (ten seconds after launch is plenty) and never await it during
  startup. It is best-effort background work; it must not slow a launch or
  block the window.
- **Ask before installing.** Someone mid-shift should not have the app restart
  under them. "Restart now" or "Later", where Later installs on next quit
  anyway - which is `electron-updater`'s default behaviour.
- **Guard on `app.isPackaged`.** There is no `app-update.yml` in a dev run, so
  the check only produces confusing errors there.

```js
function checkForUpdates() {
  if (!app.isPackaged) return;
  // Required lazily: destructuring autoUpdater runs its constructor
  // immediately (it reads app.getVersion()), and this module is loaded well
  // before app.whenReady().
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = fileLogger();
  autoUpdater.on('error', (e) => log(`error: ${e.message}`));
  autoUpdater.on('update-downloaded', async (info) => { /* ask, then quitAndInstall */ });
  autoUpdater.checkForUpdates().catch((e) => log(`check failed: ${e.message}`));
}
setTimeout(checkForUpdates, 10_000);
```

Log updates to their own file in the app-data folder. When a client says "it
didn't update", that file is the only evidence that exists.

## Code signing

Unsigned Windows installers show a SmartScreen warning, and the fix is a
certificate rather than a build flag - see `packaging-pitfalls.md` §7 for
disabling the *probe* that hangs the build, which is a different problem.
For a handful of known machines, unsigned plus an explanation of the warning
is a normal choice; for public distribution it is not.

## Locking an app to one machine

If the app is sold per site, the honest summary is: **an offline desktop app
cannot be made uncopyable.** The binary is on the customer's machine and can be
unpacked. What is achievable is making copying deliberate and inconvenient
rather than accidental - typically a signed licence token bound to a machine
fingerprint, verified locally against a public key baked into the app, with the
private key never leaving the developer.

That is a real design with real trade-offs (fingerprints change when hardware
does; hand-issued tokens need a support channel; time-based expiry can be
defeated by moving the clock). Design it explicitly and write down what it does
*not* prevent, rather than implying the app is protected.
