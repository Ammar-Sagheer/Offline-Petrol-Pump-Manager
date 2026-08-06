# Stopping the app being copied to other pumps

**Status: this document is design and reasoning only, and was never built as
written - `LICENSING_PLAN.md`'s no-server scheme is what actually shipped.**
See that document's own status line for what exists and what has not yet
been verified.

> **Read `LICENSING_PLAN.md` alongside this.** That is the agreed spec to
> build from; this document is the reasoning behind it and is still the
> right place to start. Two things here have since been decided against and
> should not be built: the licence **server** (there will never be one - keys
> are issued by hand over WhatsApp), and with it the "Suggested build order"
> below, whose steps 2-4 all assume one. The offline policy in section 3 is
> unchanged and still non-negotiable - with no server it simply enforces
> itself. Section 5's claim that a licence-derived business name is "nearly
> free" is also wrong; see the plan for why.

The problem: the app has been sold to one pump owner. Nothing currently stops
him passing the installer to another pump, or a second copy running on a
different machine, and every copy after the first is unpaid.

This document is the design for fixing that, written against the code as it
stands (auto-update via `electron-updater`, the `contextBridge` in
`electron/preload.js`, brand name in `app/_lib/brand.js`).

## Start with the ceiling, because it decides how much to build

**This cannot be made uncrackable, and trying is a waste of money.**
`asar: false` is set - required, because the bundled Postgres binaries cannot
be executed from inside an asar archive - so every line of application
JavaScript sits on disk in plaintext next to the `.exe`. Even with asar it is
one command to unpack. Any check written in JS can be found and deleted by
someone who wants to badly enough.

So the target is not "unbreakable". It is **"not worth the bother for a pump
owner in the next town"**. The realistic threat here is not a cracker; it is
the first client handing a USB stick to his cousin. That is stopped by mild,
well-placed friction. Everything below is chosen on that basis.

## The hole that exists right now, before any of this

`Pump-manager-releases` is public - deliberately, so `electron-updater` can
read it without shipping a token, and `README.md` says as much. That means
**the installer can be downloaded by anyone who knows the URL.** The client
does not even need to share the file; the repo is the distribution.

That undercuts everything else in this document, so it has to be dealt with
first. Options, roughly in order of effort:

- **Make the releases repo private and serve updates from your own endpoint**
  that checks a licence before returning the file. `electron-updater`
  supports a `generic` provider pointing at any URL. This is the real fix,
  and it is the same server the activation flow below needs anyway - so if
  you are building one, build it once.
- **Leave it public but make the download useless without a licence.** Weaker
  (the binary is still freely obtainable) but much less work, and honestly
  close to good enough given the ceiling above.

Do not solve it by embedding a GitHub token to make the repo private - that
token ships inside the app and is trivially read out of it.

## The design

### 1. Licence key, activated once online, bound to the machine

- Each sale gets a key.
- On first run the app asks for it, and sends `{key, machineFingerprint}` to
  your endpoint.
- The server records key → machine (rejecting a second, different machine for
  a single-seat key) and returns a **token signed with your private key**,
  containing at least `{key, machineId, businessName, issuedAt, expiresAt}`.
- The app verifies that signature against a **public** key compiled into it,
  then caches the token in the app-data folder.

The asymmetric signature is the part that matters. Someone reading every line
of your source still cannot mint a valid token, because the private key never
leaves your server. They are pushed towards patching out the verification
call instead - a meaningfully higher bar than copying an installer, and one
that leaves an obviously modified build.

Ed25519 via Node's built-in `crypto` is enough; no dependency needed.

### 2. Fingerprint the hardware, not a file

Do **not** generate a UUID and store it in the app-data folder. This app's
own backup and restore feature copies that entire folder to a USB stick and
back onto other machines by design - a stored identifier would travel with
it and defeat the whole thing on day one.

Use something derived from the machine: `MachineGuid` from
`HKLM\SOFTWARE\Microsoft\Cryptography`, or the `node-machine-id` package,
optionally mixed with a motherboard or disk serial. Hash it before sending;
you have no need for the raw values.

Expect it to change legitimately - reinstalled Windows, replaced disk, new
laptop after the old one died. That is the same event as the restore flow
this app already supports, so it will happen. Plan for re-activation rather
than treating a changed fingerprint as fraud: allow a small number of
re-activations per key automatically, and handle the rest by email. With a
handful of customers, manual is completely fine and far better than a false
accusation.

### 3. Never hard-lock when offline. This one is not negotiable

This app runs a petrol pump's books. It was built specifically so it keeps
working with no internet - that is the entire premise, stated in the first
line of `CLAUDE.md`.

If a licence check refuses to start the app because the client's connection
is down, you have caused a real business outage over a hypothetical pirate,
and you will be the one blamed at 7am. That is a far worse outcome than one
unpaid copy.

The rule:

- Verify **once**, online, at activation.
- After that the cached signed token is authority, offline, indefinitely.
- Re-check quietly in the background when the internet happens to be there
  (the updater already does exactly this pattern - see `checkForUpdates()`
  in `electron/main.js`, fired 10s after launch and treating no-internet as
  a silent no-op).
- If it has not been able to re-check for a long time, **warn visibly but
  keep working**.
- Refuse only on a *definite* failure - server says revoked, or the
  fingerprint does not match the token. Never on "could not reach the
  server".

### 4. Gate updates on the licence - the deterrent that actually works

You already ship auto-update. Tie it to a valid licence and an unlicensed
copy silently stops receiving bug fixes and new features, and drifts further
behind every month.

For a tool a business depends on daily, that is a stronger practical
deterrent than any lock, and it fails safe: the worst case is a pirate keeps
using an old build, not that a paying client's app dies.

### 5. Derive the business name from the licence

The cheapest and most effective item here, and it is nearly free because the
plumbing exists.

`BUSINESS_NAME` in `app/_lib/brand.js` is already a single constant consumed
everywhere:

- `app/_components/admin/AdminNavbar.js` - top of every screen
- `app/admin/login/page.js` and `app/admin/setup/page.js`
- `app/layout.js` - every browser tab title
- `app/_lib/excel-report.js` - the monthly workbook handed to an accountant

Make it come from the signed token instead of a constant. A copy passed to
another pump then displays **the first client's business name on every screen
and every exported report**, and cannot be edited without patching the app.

It is not a lock. It is worse for the pirate than a lock: it is embarrassing,
it is visible to their own staff and their accountant, and it makes the
software obviously not theirs. For friendly sharing - the actual threat -
this stops more than a licence check does.

## What to skip

Obfuscators, custom packers, anti-debug tricks. They cost real time, make
your own crash reports unreadable, break the "read the stack trace from
`next-server.log`" debugging this project depends on, and buy nothing against
anyone capable enough to be a threat.

## Suggested build order

Each step is useful on its own, so this can stop at any point:

1. **Licence-derived business name** - highest deterrent per hour of work.
   Needs the token, so it comes with step 2, but it is the reason to bother.
2. **Activation + signed token**, with the offline policy above.
3. **Gate updates on the licence.**
4. **Move releases behind your own endpoint** and make the repo private.

Steps 2-4 all need the same small server. Nothing exotic: one endpoint to
activate, one to re-verify, one to serve update files. A serverless function
and a table with `{key, machine_id, activations, revoked}` covers it.

## Where this touches the existing code

| Area | Note |
|---|---|
| `electron/preload.js` | The `contextBridge` already exists for restore. Licence state belongs on the main-process side of it too - do **not** put the token or verification in the renderer, where the page can be inspected. Add a second exposed function rather than a second channel. |
| `electron/main.js` | Activation check belongs alongside `bootstrapDatabase()` in `app.whenReady()`, before the window loads. `checkForUpdates()` is the model for the background re-check. |
| `electron/config.js` | Stores per-install state in the app-data folder already. The cached token can live beside `config.json` - but see the fingerprint warning above about what that folder does during a restore. |
| `app/_lib/brand.js` | `BUSINESS_NAME` becomes licence-derived rather than a constant. |
| `package.json` | `build.publish` currently points at the public GitHub repo. |

## Open questions

- **Host the licence endpoint yourself, or use a managed licensing service?**
  Managed (Keygen, Cryptolens, etc.) removes the server, the key storage and
  the signing entirely, at a monthly cost. For a handful of customers that
  may well be cheaper than the hours. Worth pricing before building.
- **One seat per key, or per-site with a seat count?** Affects whether the
  owner can legitimately run it on an office machine as well as the pump one.
  Ask the client what they actually expect before deciding for them.
- **What happens at the end of a support period?** Keep working forever but
  stop updating (recommended - never break a paying client's books), or stop
  working? This is a commercial decision, not a technical one, and it should
  be written into the invoice either way.

## Worth saying plainly

The strongest protections here are not code:

- Sell it per site, in writing, on the invoice.
- Sell **support and updates** as the ongoing product rather than the binary.
  Data migration, a wrong nozzle mapping, a bad day that needs clearing,
  a new report - the client needs you, and a pirate has nobody.
- Every pitfall in `PROGRESS.md`'s bug log is a reminder that this software
  is not self-supporting on someone else's machine.

Technical measures raise the friction. The relationship is what actually
gets paid for.
