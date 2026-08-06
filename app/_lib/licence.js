/**
 * Reads and re-verifies the licence token Electron's main process passed
 * into this server's environment - see docs/LICENSING_PLAN.md, "Wiring the
 * token into the app".
 *
 * Re-verifies the signature itself rather than trusting the env var as-is:
 * it costs nothing, and it leaves exactly one verification path to reason
 * about instead of two different levels of trust between the two processes.
 *
 * server-only, like helpers.js and date-helpers.js: reads process.env values
 * that only exist on the server, so it can never end up in a client bundle.
 */
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NEUTRAL_NAME = 'Pump Manager';
const NEUTRAL_INITIALS = 'PM';

let cached; // module-scope memo - one verification per server process, not per render

function publicKey() {
  const keyPath = path.join(process.cwd(), 'licence-key.json');
  const { publicKey: pem } = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return crypto.createPublicKey(pem);
}

function verify(token) {
  const [payloadB64, sigB64] = String(token).trim().split('.');
  if (!payloadB64 || !sigB64) throw new Error('malformed licence token');

  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const signature = Buffer.from(sigB64, 'base64url');
  if (!crypto.verify(null, Buffer.from(payloadJson, 'utf8'), publicKey(), signature)) {
    throw new Error('licence signature does not verify');
  }

  const payload = JSON.parse(payloadJson);
  if (payload.v !== 1) throw new Error(`unknown licence format version ${payload.v}`);
  return payload;
}

/**
 * The current install's licence payload, or null - a grace-period install,
 * a plain `npm run dev` with no token at all, or (should not happen, since
 * Electron only ever passes a token it already verified) one that fails to
 * verify here. Every caller in this app treats null as "use the neutral
 * defaults", never as an error to throw over.
 */
export function getLicence() {
  if (cached !== undefined) return cached;

  const token = process.env.LICENCE_TOKEN;
  if (!token) {
    cached = null;
    return cached;
  }
  try {
    cached = verify(token);
  } catch {
    cached = null;
  }
  return cached;
}

export function licensedBusinessName() {
  return getLicence()?.b ?? NEUTRAL_NAME;
}

export function licensedBusinessInitials() {
  return getLicence()?.i ?? NEUTRAL_INITIALS;
}

/** ISO date string while an unlicensed-but-existing install's grace period is running, else null. */
export function graceUntil() {
  return process.env.LICENCE_GRACE_UNTIL || null;
}

/**
 * Whether this install is currently soft-restricted - see
 * docs/LICENSING_PLAN.md, "Restricting after the support date". Read fresh
 * from licence.json on every call, deliberately NOT memoised like
 * getLicence(): Electron's main process can flip this mid-session (the
 * moment its online check completes, or the local clock check at next
 * launch), and a stale in-memory value would mean restriction only ever
 * took effect after a restart. requireRole() (helpers.js) is what actually
 * enforces it; this is just the read.
 *
 * Fails to `false` (not restricted) on any read/parse error, same direction
 * as getLicence() falling back to neutral defaults - a missing or corrupt
 * file must never be the reason a paying client gets refused, only an
 * actual restriction recorded by Electron should.
 */
export function isRestricted() {
  const appDataDir = process.env.APP_DATA_DIR;
  if (!appDataDir) return false; // plain `npm run dev`, nothing to read

  try {
    const raw = fs.readFileSync(path.join(appDataDir, 'licence.json'), 'utf8');
    return JSON.parse(raw).restricted === true;
  } catch {
    return false;
  }
}
