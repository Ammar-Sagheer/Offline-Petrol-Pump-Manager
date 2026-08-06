# Licensing workflow - day to day steps

The design and reasoning live in `docs/LICENSING_PLAN.md`. This file is just
the checklist: what to actually type/click, in order, for the three things
that come up over and over - issuing a new licence, and blocking/unblocking
one. See `docs/LICENSING.md` for the original problem statement.

Prerequisite (one-time, already done): `~/.pump-manager/private.pem` exists
on the owner's machine, from running `node tools/generate-keypair.js` once.
Without it `tools/issue-licence.js` refuses to run.

## 1. Client installs the app and sends you their code

1. Client installs and opens the app for the first time.
2. The activation screen shows an **Installation code**, e.g.
   `955D-6D62-F228-DA11-91B6-6CEA-0E72-9370`.
3. Client copies it (the app has a Copy button) and sends it to you - WhatsApp,
   whatever. That code identifies their computer; it is not secret.

## 2. You issue their licence

Run on your own machine:

```bash
node tools/issue-licence.js \
  --machine 955D-6D62-F228-DA11-91B6-6CEA-0E72-9370 \
  --business "Client Business Name" \
  --initials CBN \
  --seat 1 \
  --support 2027-08-06
```

- `--machine` - paste exactly what the client sent, do not retype it.
- `--support` - the date their support/licence period runs until (`YYYY-MM-DD`).
- This writes `Client-Business-Name-licence-seat1.txt` in the current folder,
  and appends a row to `~/.pump-manager/register.csv` (your private client
  list - never committed).

For the same client's *second* seat (2 seats per client is the agreed
policy), reuse the key it printed so the register shows both under one
client:

```bash
node tools/issue-licence.js \
  --machine <second machine's code> \
  --business "Client Business Name" --initials CBN \
  --seat 2 --support 2027-08-06 \
  --key PM-XXXX-XXXX-XXXX
```

Send the generated `.txt` file to the client (WhatsApp as a document works
fine - it's plain text).

## 3. Client activates

1. Client pastes the text you sent into the "Already have your licence?" box
   and clicks **Activate** - or uses **Load from file...** to pick the `.txt`
   directly.
2. On success the activation window closes itself and the app opens normally.

## 4. Blocking a client (stop paying, chargeback, etc.)

Blocking is by **licence key** (the `PM-XXXX-XXXX-XXXX` from step 2, the `k`
field), not by machine code - one key blocks every seat issued under it.

1. Look up the key in `~/.pump-manager/register.csv` if you don't remember it.
2. Edit `blocked-licences.json` in the
   `Ammar-Sagheer/Pump-manager-releases` GitHub repo (edit directly on
   github.com, or clone it locally and push):

   ```json
   { "blocked": ["PM-XXXX-XXXX-XXXX"] }
   ```

   To block more than one client, add more keys to the same array:

   ```json
   { "blocked": ["PM-XXXX-XXXX-XXXX", "PM-YYYY-YYYY-YYYY"] }
   ```

   Keep the whole array on one line - a stray line break inside a quoted
   string breaks the JSON and the check silently does nothing until it's
   fixed.
3. Commit and push.
4. Takes effect next time the client's app has internet: it checks this file
   automatically ~10s after every launch (not continuously mid-session), and
   flips on a red "licence needs renewing" banner - existing data stays
   viewable/exportable, only new entries are refused. No action needed on
   their end.

## 5. Unblocking / renewing

Remove that key from `blocked-licences.json`, commit, push. Next time their
app has internet it clears automatically, same ~10s-after-launch check.

(If the block was instead triggered by their support date passing rather
than by this file, see `docs/LICENSING_PLAN.md`'s "Restricting after the
support date" section - the client should just be issued and activate a
renewed licence, which always clears any restriction outright.)

## Verifying any of the above actually happened

Every online check writes one line to a log on the client's machine:

```
%APPDATA%\<app name>\licence-status.log
```

```
2026-08-06T21:55:34.642Z checked: blocked=true pastSupport=false trustedNow=... -> restricted=true
```

Ask the client to open and paste that file's last few lines if something
doesn't look right - it says exactly what the app saw and decided.
