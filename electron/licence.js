/**
 * Licence tokens: Ed25519-signed, issued by hand with tools/issue-licence.js,
 * verified here with no server involved at all - see docs/LICENSING_PLAN.md
 * for the full scheme and why there is deliberately no revocation.
 *
 * Pure data in this file - reading the fingerprint, verifying a token,
 * loading/saving licence.json. Nothing here touches a BrowserWindow or
 * ipcMain; that orchestration lives in licence-window.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { licencePath } = require('./config');

const LICENCE_KEY_PATH = path.join(__dirname, '..', 'licence-key.json');

function publicKey() {
  const { publicKey: pem } = JSON.parse(fs.readFileSync(LICENCE_KEY_PATH, 'utf8'));
  return crypto.createPublicKey(pem);
}

/**
 * The machine's own stable identifier, before hashing. Windows only in
 * practice - this app ships for Windows - with fallbacks so `npm run dev`
 * and this codebase's own tooling still run somewhere to test against.
 *
 * MachineGuid alone, deliberately not mixed with disk/motherboard serials:
 * see docs/LICENSING_PLAN.md, "Machine fingerprint", for why mixing in more
 * "stronger-sounding" identifiers is actively worse here - a replaced disk
 * would invalidate a paying client's licence for no reason.
 */
function readRawMachineId() {
  if (process.platform === 'win32') {
    const output = execFileSync('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ]).toString();
    const match = output.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (!match) throw new Error("Could not read this machine's identifier from the registry.");
    return match[1];
  }
  if (process.platform === 'darwin') {
    const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']).toString();
    const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (!match) throw new Error("Could not read this machine's identifier.");
    return match[1];
  }
  // Linux - this app does not ship here; only reached by dev tooling.
  return fs.readFileSync('/etc/machine-id', 'utf8').trim();
}

/**
 * `A1B2-C3D4-E5F6-7890` - sha256(machineGuid + appId), first 32 hex chars,
 * grouped in fours. Shown to the client as the "installation code" and baked
 * into the token's `m` field by tools/issue-licence.js.
 *
 * PM_FINGERPRINT dev override: the ONLY way to test this off real Windows,
 * and guarded so it can never exist in a packaged build - do not soften this
 * guard, that is the entire point of it.
 */
function fingerprint() {
  if (!app.isPackaged && process.env.PM_FINGERPRINT) {
    return process.env.PM_FINGERPRINT;
  }
  const raw = readRawMachineId();
  const hash = crypto
    .createHash('sha256')
    .update(raw + app.getName())
    .digest('hex')
    .slice(0, 32);
  return hash
    .toUpperCase()
    .match(/.{1,4}/g)
    .join('-');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url');
}

/**
 * Verifies signature and shape only - not fingerprint, not expiry. Callers
 * decide what to do about those, since the activation window and the Next
 * server side (app/_lib/licence.js) react to a mismatch differently (one
 * shows a message, the other falls back to neutral defaults).
 */
function verify(token) {
  const parts = String(token).trim().split('.');
  if (parts.length !== 2) throw new Error('malformed licence token');

  const [payloadB64, sigB64] = parts;
  const payloadJson = base64urlDecode(payloadB64).toString('utf8');
  const signature = base64urlDecode(sigB64);

  if (!crypto.verify(null, Buffer.from(payloadJson, 'utf8'), publicKey(), signature)) {
    throw new Error('licence signature does not verify');
  }

  const payload = JSON.parse(payloadJson);
  if (payload.v !== 1) throw new Error(`unknown licence format version ${payload.v}`);
  return payload;
}

function isExpired(payload) {
  return payload.ex != null && new Date(payload.ex) < new Date();
}

function readLicenceFile() {
  try {
    return JSON.parse(fs.readFileSync(licencePath(), 'utf8'));
  } catch {
    return {};
  }
}

/** The stored licence, verified, or null if there is none / it no longer verifies. */
function loadLicence() {
  const { token } = readLicenceFile();
  if (!token) return null;
  try {
    return { token, payload: verify(token) };
  } catch {
    return null;
  }
}

/**
 * Overwrites licence.json with just the token - any grace record or
 * restriction flag on it is moot once a fresh licence is activated. A
 * renewed/updated licence is meant to clear a prior restriction, not carry
 * it forward.
 */
function saveLicence(token) {
  fs.writeFileSync(licencePath(), JSON.stringify({ token }, null, 2), { mode: 0o600 });
}

/**
 * Whether this install is currently soft-restricted - existing data stays
 * readable/exportable, new entries refused (enforced on the Next side via
 * requireRole(), see app/_lib/helpers.js). Stored on licence.json itself,
 * alongside the token, so it is not undone by simply going offline again -
 * see setRestricted() for who is allowed to change it and why.
 */
function isRestricted() {
  return readLicenceFile().restricted === true;
}

/**
 * Sets or clears the restriction flag. Two very different kinds of caller:
 *
 *   - The LOCAL clock-only check (localClockPastSupport()) may only ever
 *     call this with `true`. An unverifiable local clock is exactly what
 *     someone dodging a restriction would roll backward - letting that same
 *     untrusted clock also CLEAR a restriction would make the whole check
 *     worthless the moment anyone thought to try it.
 *   - The online check (electron/licence-status.js), which reads a
 *     timestamp from an HTTP response the client cannot forge, may call
 *     this with `true` OR `false` - it is the only path allowed to lift a
 *     restriction short of activating an actual new licence.
 */
function setRestricted(value) {
  const current = readLicenceFile();
  fs.writeFileSync(
    licencePath(),
    JSON.stringify({ ...current, restricted: Boolean(value) }, null, 2),
    { mode: 0o600 },
  );
}

/**
 * The weak, offline-only signal: compares a licence's support-until date to
 * THIS MACHINE'S OWN CLOCK, which it has no way to verify. Good enough to
 * catch someone who has not thought about their system clock at all; a
 * determined person can defeat it by rolling their clock back, which is
 * exactly why this may only ever push the restriction flag toward `true`,
 * never clear it - see docs/LICENSING_PLAN.md's restriction-enforcement
 * section for the full reasoning.
 */
function localClockPastSupport(payload) {
  return payload.su != null && new Date(payload.su) < new Date();
}

/**
 * Pulls the actual token out of whatever text is on hand - which is not
 * always JUST the token. A client hands over the whole .txt file
 * tools/issue-licence.js writes (a human-readable header, then the token),
 * and pasting works the same way if someone does "select all" in Notepad
 * rather than carefully highlighting one line - a completely normal thing
 * to do.
 *
 * NOT a blind "strip every whitespace character" - an earlier version of the
 * activation window did that, and it silently fused the header's last date
 * onto the front of the token with no boundary between them (the blank line
 * separating the two is whitespace too, so removing it joined "...2027-08-08"
 * directly onto "eyJ2Ijo...", corrupting the payload while still LOOKING like
 * a plausible token). Line-by-line instead: keep only lines that, once
 * trimmed, are made purely of token-safe characters (base64url plus the one
 * '.' separator) - every header line has a space, a colon or parentheses, so
 * this is exactly what discards them. A token wrapped by WhatsApp/Mail across
 * several lines survives too: each fragment is still pure token-safe
 * characters on its own line, so every kept line simply joins back together
 * in order.
 *
 * Lives here rather than only in the window that first needed it: the
 * in-app renewal dialog feeds this same function from a completely
 * different direction (see the 'licence-renew' handler in main.js), and one
 * bug fixed in two places is a bug still shipping in one of them.
 */
function extractToken(rawText) {
  return String(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /^[A-Za-z0-9_.-]+$/.test(line))
    .join('');
}

/**
 * The grace period's start, recorded in licence.json itself so it cannot be
 * renewed by deleting some other file and restarting - see
 * docs/LICENSING_PLAN.md, "A grace path for pre-licensing installs".
 * Idempotent: the first call wins, every later call returns the same date.
 */
function ensureGraceStarted() {
  const existing = readLicenceFile();
  if (existing.graceStartedAt) return existing.graceStartedAt;

  const graceStartedAt = new Date().toISOString();
  fs.writeFileSync(licencePath(), JSON.stringify({ graceStartedAt }, null, 2), { mode: 0o600 });
  return graceStartedAt;
}

module.exports = {
  fingerprint,
  verify,
  extractToken,
  isExpired,
  loadLicence,
  saveLicence,
  ensureGraceStarted,
  isRestricted,
  setRestricted,
  localClockPastSupport,
};
