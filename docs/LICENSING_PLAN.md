# Licensing: the implementation plan

**Status: agreed, not yet built. This is the spec to build from.**

`LICENSING.md` is the reasoning - why this is worth doing at all, what the
ceiling is, and which measures are worth the hours. Read it first; it is
short. **This document supersedes its "Suggested build order" section**, for
one reason given below.

## The decision that shapes everything here

**There will never be a licence server.** Keys are issued by hand and sent
over WhatsApp. This was the owner's call, made with the trade-offs below
understood.

`LICENSING.md` puts a small server first and treats steps 2-4 as needing it.
For a handful of clients that is the wrong order: the signed-token scheme
below closes the actual hole - a client passing the installer to a friend -
with no server at all. So the server steps are not deferred, they are
**dropped**.

What that costs, permanently:

- **No revocation.** Once a token is sent it works on that machine forever.
  A chargeback, or a client who stops paying and keeps using it, has no
  remedy. The only lever left is `expiresAt`, and using it means a paying
  client's books stop opening on a date - which is the outcome
  `LICENSING.md` argues hardest against. Decision: `expiresAt: null`,
  perpetual, a sale is final.
- **No re-verification**, so a cloned disk image (which clones `MachineGuid`
  along with everything else) is undetectable. Narrow case, and well past
  "cousin with a USB stick".
- **`Pump-manager-releases` stays public.** Fine - the download was never the
  lever. The installer is freely obtainable and does not run without a
  licence.

What it gains, and this is not a consolation prize: **the app makes zero
network calls for licensing.** The "never hard-lock when offline" rule in
`LICENSING.md` - the one marked non-negotiable - enforces itself, because
there is no server to be unreachable. No background re-check, no degraded
state, no stale-licence warning banner, no risk of the licence check causing
a 7am outage. For an app whose entire premise is offline operation this is
arguably the better architecture, not merely the cheaper one.

**Do not add a server later without re-reading this section.** Every
simplification below depends on it.

## The scheme

### Keypair

Ed25519 via Node's built-in `crypto`. No dependency. Generated once, by the
owner, never committed.

- **Private key** - password manager plus one offline copy, at
  `~/.pump-manager/private.pem` by default (path overridable by flag). Lose
  it and no new client can ever be licensed; existing clients keep working.
  Leak it and the whole scheme is void.
- **Public key** - `licence-key.json` at the repo root, committed.

Root JSON rather than a JS constant because `electron/` is CommonJS and
`app/` is ESM. A `.json` is readable from both with no module-format dance
and no second copy of the key to drift.

### Token format

`base64url(payload) + "." + base64url(signature)`.

Payload keys are single letters, deliberately. The whole token is pasted
into a WhatsApp message by hand; every character saved is one fewer chance
of a truncated paste. Roughly 250 characters this way, against ~360 with
readable key names.

```json
{
  "v": 1,
  "k": "PM-4KJ2-9XQ7-M3TA",
  "m": "a1b2c3d4e5f67890a1b2c3d4e5f67890",
  "b": "Mubeen Petroleum Service",
  "i": "MPS",
  "s": 1,
  "ia": "2026-08-06",
  "ex": null,
  "su": "2027-08-06"
}
```

| Field | Meaning |
|---|---|
| `v` | Format version. Bump only on a breaking change; installed clients cannot be migrated remotely. |
| `k` | Licence key - a human-readable handle for the register, not a secret. |
| `m` | Machine fingerprint (see below). |
| `b` / `i` | Business name and initials. These replace `BUSINESS_NAME` / `BUSINESS_INITIALS`. |
| `s` | Seat number, for the owner's own records when one client gets two machines. |
| `ia` | Issued date. |
| `ex` | Hard expiry. **Ships as `null`.** The field exists so the format never has to change; nothing should set it without a deliberate decision. |
| `su` | Support-until date. Gates *updates only*, never the app itself. |

`ex` and `su` both ship from day one even though `su` starts dormant,
because the format cannot be changed under installed clients afterwards.

### Machine fingerprint

Windows: `MachineGuid` from `HKLM\SOFTWARE\Microsoft\Cryptography`, read with
`execFileSync('reg', ['query', ...])`. No npm dependency - `node-machine-id`
shells out to `reg` anyway, and this project avoids dependencies it can
write in ten lines.

**`MachineGuid` alone. Do not mix in disk or motherboard serials.** Mixing
sounds stronger and is actively worse: a replaced disk would invalidate a
paying client's licence, and re-issuing is a manual WhatsApp round trip.
`MachineGuid` survives hardware changes and only changes on a Windows
reinstall - which is the same event as a restore-onto-new-machine, where a
re-issue is expected anyway.

Then `sha256(machineGuid + appId)`, first 32 hex characters, displayed
grouped in fours: `A1B2-C3D4-E5F6-7890`.

Fallbacks so dev runs work at all: `/etc/machine-id` on Linux,
`IOPlatformUUID` on macOS.

**Dev override:** a `PM_FINGERPRINT` env var, honoured **only when
`!app.isPackaged`**. It is the only way to test the flow off Windows. It is
a bypass, which is exactly why it must not exist in a packaged build - guard
it and do not soften the guard.

### Where the token is stored

`licence.json` in the app-data folder, **beside `config.json`, never inside
it**, and never inside `db-data/`.

This is load-bearing and it is worth checking the code before changing it.
`createBackup` (`app/_lib/actions.js`) copies exactly `db-data/` and
`config.json`. `performRestore` (`electron/main.js`) replaces exactly those
two. Both name their paths explicitly, so a `licence.json` sibling is never
captured by a backup and never overwritten by a restore. Consequences, all
of them intended:

- Client backs up to USB and restores onto a **new laptop**: data and
  credentials cross over, the licence does not, he re-activates. Correct.
- Friend is handed the backup folder: no licence in it at all.
- Friend hand-copies the whole app-data folder: gets a token whose `m` does
  not match his own fingerprint. Refused.

This is also why `LICENSING.md` forbids a generated UUID in that folder. The
same reasoning applies to putting the token in `config.json` - it would
travel on the USB stick and defeat the whole thing.

## The activation window

Shown **before `bootstrapDatabase()`**. Two reasons: there is no point
starting Postgres for a machine that will not be allowed to run, and it
cannot use Next because the Next server is not up yet.

Plain HTML at `electron/licence/activate.html`, with **its own minimal
preload** - not the app's `preload.js`. Three exposed functions: `getCode()`,
`activate(text)`, `saveRequestFile()`. Verification happens in main, never in
the renderer; `LICENSING.md`'s note about the `contextBridge` applies here
exactly.

```
+-- Pump Manager - Activation --------------------+
|                                                 |
|  This copy is not yet activated.                |
|                                                 |
|  Installation code                              |
|  +--------------------------+                   |
|  | A1B2-C3D4-E5F6-7890      |  [ Copy ]         |
|  +--------------------------+                   |
|                                                 |
|  Send this code on WhatsApp to <number>         |
|  to receive your licence.                       |
|                     [ Save request file... ]    |
|                                                 |
|  -- Already have your licence? --                |
|  +---------------------------------------+      |
|  | paste it here                         |      |
|  +---------------------------------------+      |
|  [ Load from file... ]        [ Activate ]      |
|                                      [ Quit ]   |
+-------------------------------------------------+
```

**The paste box must strip all whitespace and newlines before parsing.**
WhatsApp and Windows Mail both wrap long strings. Without this, roughly every
second activation fails for a reason neither party can see from where they
are standing. It is two lines of code and it prevents the most likely
support call this feature will generate.

`Save request file...` writes `pump-manager-request.txt` to the Desktop
containing the installation code, the app version and the date. Some clients
will mistype a code; attaching a file is more reliable, and the version and
date are useful when something is wrong.

Error messages, worded for a client reading them down the phone:

| Cause | Message |
|---|---|
| Signature invalid | "That licence is not valid. Please check you copied all of it." |
| `m` mismatch | "That licence was issued for a different computer." |
| `ex` in the past | "That licence expired on <date>." |
| Unparseable | "That doesn't look like a licence. Try the 'Load from file' button." |

## Wiring the token into the app

Follow the existing pattern exactly. `bootstrapDatabase()` already returns an
`env` object that `startNextServer()` spreads into the Next child; the token
rides along the same way.

```js
app.whenReady():
  const licence = await requireLicence();   // NEW - gate, may show the window
  const { env, stop } = await bootstrapDatabase();
  await createWindow({ ...env, LICENCE_TOKEN: licence.raw });
  setTimeout(checkForUpdates, 10_000);
```

The Next side **re-verifies the signature** rather than trusting the env var.
It costs nothing and leaves one verification path to reason about instead of
two different levels of trust.

## Making BUSINESS_NAME licence-derived

`LICENSING.md` calls this "nearly free because the plumbing exists". **It is
not**, and the reason matters: `AdminNavbar.js` and `BrandMark.js` are
`'use client'` components. Next inlines `process.env` into client bundles at
**build** time, so a value that only exists at **run** time cannot reach them
through env. It needs a real server-to-client path.

`app/_lib/brand.js` keeps its constants, but they become **fallbacks**, and
the default changes from `Mubeen Petroleum Service` to a neutral
`Pump Manager`. Once the name comes from the licence, hard-coding one
client's name is the very bug being fixed.

| File | Change |
|---|---|
| `app/_lib/licence.js` *(new, server-only)* | Parse and verify `LICENCE_TOKEN`; memoise at module scope, so it is one verification per server process, not per render. |
| `app/layout.js` | `metadata` becomes `async generateMetadata()`. Server-side, trivial. |
| `app/_components/ui/BrandProvider.js` *(new, `'use client'`)* | Context holding `{ businessName, initials }`. |
| `app/admin/layout.js` | Server component: read the licence, wrap children in `<BrandProvider>`. |
| `AdminNavbar.js`, `BrandMark.js` | Static import becomes the context hook. |
| `app/admin/login/page.js`, `app/admin/setup/page.js` | Server components **outside** the admin layout - they read the licence directly, no context. Better this way: the client's name is on the first screen a pirate sees. |
| `app/_lib/excel-report.js` | Takes `businessName` as an argument instead of importing it. Keeps it a pure builder; the calling server action supplies the value. |

## Update gating

Client-side only, since there is no server: `checkForUpdates()` in
`electron/main.js` returns early if `su` has passed, alongside its existing
`if (!app.isPackaged) return`.

Trivially patchable, and that is fine - it is aimed at the pump owner in the
next town, not a cracker. It also fails safe in the right direction: the
worst case is that someone keeps running an old build.

**Ships dormant.** See open question 2.

## The issuing CLI

`tools/issue-licence.js`. **Never shipped.** `build.files` in `package.json`
is an allowlist and does not include `tools/`, so it is already excluded -
add an explicit `!tools/**/*` anyway, so that a later edit to that list
cannot leak the tool.

```bash
node tools/issue-licence.js \
  --machine A1B2-C3D4-E5F6-7890 \
  --business "Al-Karam Filling Station" \
  --initials AKF \
  --seat 1 \
  --support 2027-08-06
```

Writes `Al-Karam-Filling-Station-licence.txt` and appends a row to a
register.

**Issue the licence as `.txt`, not a custom extension.** WhatsApp sends
`.txt` as a document without complaint and Windows opens it in Notepad, so
the client can either hand it to the file picker or open it and copy the
contents. An unknown extension risks WhatsApp refusing the attachment and
Windows having no handler for it - a support call for nothing.

**Keep the register out of git.** It is the client list; if this repo is ever
made public it leaks, and it does not belong in source control regardless.
It lives next to the private key. Add it to `.gitignore` if the CLI defaults
to writing inside the repo.

## What the client does

1. Owner sends the installer - WhatsApp, email, USB, it no longer matters.
2. Client installs and runs it. The activation window shows his
   **installation code**.
3. He gets the code to the owner, one of three ways:
   - **Copy button, then WhatsApp.** 16 characters in four groups. The
     normal path.
   - **Save request file...**, then attach the `.txt` from his Desktop.
     Better for anyone likely to mistype.
   - **Owner reads it off the screen** while installing it for him. Likely
     for the first few sales.
4. Owner runs the CLI and sends back the licence `.txt`.
5. Client presses **Load from file...** or pastes the text, then
   **Activate**. The window closes, the app starts, his own business name is
   on every screen and every exported report.

One message each way. No account, no password, and no internet needed on the
pump machine at all - only on whatever phone he already has WhatsApp on.

**New laptop or Windows reinstall:** the same exchange again. He restores his
data from the USB backup as he does today, then sends the new installation
code. The owner checks the register, sees it is the same client, and issues a
replacement. Manual is genuinely fine at this volume, and it means a paying
customer is never falsely accused.

**His friend:** installs it, meets the activation window, has no code anyone
will answer. If he is determined enough to patch the check out, he gets an
app titled *Mubeen Petroleum Service* on every screen and on every Excel
report he hands his accountant. That is the deterrent `LICENSING.md` rates
highest, and it is the one that actually fits this threat.

## The risk that will bite first

**The existing client has a live install with real data.** Auto-update means
he restarts into the activation window whenever a release is published. If
his token is not already on his machine, he is locked out mid-shift.

Two mitigations, both worth doing:

1. **Sequence the release deliberately.** Mint his licence, send it, get him
   to confirm he has the file - *then* publish. This is a process step, not
   code, and it is the one that actually protects him.
2. **A grace path for pre-licensing installs.** If `licence.json` is absent
   but `db-data/` already exists, allow 14 days with a visible banner rather
   than blocking. Honest trade-off: it is a bypass - someone could restore a
   backup to manufacture a `db-data/` and buy 14 days. It is friction, not a
   lock, and it expires. Against the alternative of locking out the man who
   paid, take it. Record `graceStartedAt` in `licence.json` so it cannot be
   renewed by restarting. See open question 4.

## Testing

Everything except the first item can be exercised in a sandbox with
`PM_FINGERPRINT`, the same technique `PROGRESS.md` records for backup and
restore - several "only works in the packaged app" features are just env
vars.

- **Fingerprint reading on real Windows.** The one piece that cannot be
  tested anywhere else, and it must be verified before a licence is sent to
  anybody.
- Fresh install, no licence - activation window appears, app does not start.
- Valid licence - activates, name appears in navbar, tab title, login screen
  and the Excel export.
- Licence minted for a different fingerprint - refused with the right
  message.
- Truncated or line-wrapped paste - the whitespace strip handles the wrap;
  truncation gives "check you copied all of it".
- Expired `ex` - refused. (Not shipped set, but the path must work.)
- Restore onto a fresh machine - data arrives, licence does not, activation
  window appears.
- Dev with no `LICENCE_TOKEN` - falls back to `Pump Manager` cleanly, does
  not crash. `npm run dev` in a browser must still work.

## Files

**New:** `electron/licence.js` (fingerprint, verify, load/save) ·
`electron/licence-window.js` · `electron/licence/activate.html` + its own
preload · `licence-key.json` (root, committed) · `tools/issue-licence.js` ·
`app/_lib/licence.js` · `app/_components/ui/BrandProvider.js`

**Changed:** `electron/main.js` (gate before `bootstrapDatabase()`,
`LICENCE_TOKEN` into the child env, `su` check in `checkForUpdates()`) ·
`electron/config.js` (`licencePath()`) · `app/_lib/brand.js` ·
`app/layout.js` · `app/admin/layout.js` · `AdminNavbar.js` · `BrandMark.js` ·
`app/admin/login/page.js` · `app/admin/setup/page.js` ·
`app/_lib/excel-report.js` · `package.json` (`!tools/**/*`) ·
`docs/LICENSING.md` (mark which parts this plan drops)

## Open questions - answer before building

These are the owner's decisions, not the implementer's. **Do not guess them;
ask.** Recommendations given, but they are only that.

1. **Seats per key** - one machine, or two? Some owners reasonably expect the
   pump laptop *and* an office PC, and getting it wrong means accusing a
   paying customer of piracy. *Recommend 2: costs nothing, avoids the
   awkward call.* With no server this is arithmetic, not enforcement - two
   seats means two tokens, each bound to its own fingerprint.
2. **`su` / support model** - ship the field set a year out but leave update
   gating dormant, or enforce from day one? *Recommend dormant.*
3. **The WhatsApp number** to print on the activation screen. Needed
   verbatim.
4. **Grace period** - build the 14-day pre-licensing grace, or skip it and
   sequence the existing client's licence by hand? *Recommend building it.*
5. **Confirm `Mubeen Petroleum Service` / `MPS`** is exactly right. It gets
   baked into a signed token that cannot be edited afterwards.
