#!/usr/bin/env node
/**
 * Issues one signed licence for one machine. Run by hand by the owner - see
 * docs/LICENSING_PLAN.md, "The issuing CLI". Never shipped: package.json's
 * `build.files` is an allowlist that already excludes tools/, plus an
 * explicit `!tools/**\/*` so a later edit to that list cannot leak it.
 *
 * node tools/issue-licence.js \
 *   --machine A1B2-C3D4-E5F6-7890 \
 *   --business "Al-Karam Filling Station" \
 *   --initials AKF \
 *   --seat 1 \
 *   --support 2027-08-06
 *
 * For a client's SECOND seat (office PC, in addition to the pump laptop -
 * the owner's decision was 2 seats per client), reuse the licence key
 * printed by the first run with --key, so the register shows both as the
 * same client:
 *
 * node tools/issue-licence.js --machine <second machine's code> \
 *   --business "Al-Karam Filling Station" --initials AKF --seat 2 \
 *   --support 2027-08-06 --key PM-XXXX-XXXX-XXXX
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? null : process.argv[index + 1];
  if (!value && required) {
    console.error(`Missing required --${name} <value>`);
    process.exit(1);
  }
  return value;
}

const privateKeyPath =
  arg('private-key', false) || path.join(os.homedir(), '.pump-manager', 'private.pem');
const registerPath =
  arg('register', false) || path.join(os.homedir(), '.pump-manager', 'register.csv');

if (!fs.existsSync(privateKeyPath)) {
  console.error(`No private key at ${privateKeyPath} - run tools/generate-keypair.js first.`);
  process.exit(1);
}

const machine = arg('machine');
const business = arg('business');
const initials = arg('initials');
const seat = Number(arg('seat'));
const support = arg('support');
const existingKey = arg('key', false);

// 8 groups of 4 (32 hex chars total) - what fingerprint() in electron/licence.js
// actually produces: sha256(machineGuid + appId), first 32 hex characters,
// grouped in fours. (Not the shorter 4-group form shown in the activation
// window's own mockup in docs/LICENSING_PLAN.md - that illustration is
// abbreviated; the plan's prose and its own payload JSON example both spell
// out the real 32-character length.)
if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/.test(machine)) {
  console.error(
    '--machine should be 8 groups of 4 hex characters, copied exactly from the client - do not retype it.',
  );
  process.exit(1);
}
if (!Number.isInteger(seat) || seat < 1) {
  console.error('--seat must be a positive whole number (1, 2, ...).');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(support)) {
  console.error('--support must be a date as YYYY-MM-DD.');
  process.exit(1);
}

function randomKey() {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `PM-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// Payload keys are single letters on purpose - the whole token gets pasted
// by hand into WhatsApp, and every character saved is one fewer chance of a
// truncated paste. See docs/LICENSING_PLAN.md, "Token format".
const payload = {
  v: 1,
  k: existingKey || randomKey(),
  m: machine,
  b: business,
  i: initials,
  s: seat,
  ia: new Date().toISOString().slice(0, 10),
  // Perpetual - a sale is final. Do not set this without re-reading
  // docs/LICENSING_PLAN.md's "The decision that shapes everything here" first.
  ex: null,
  su: support,
};

const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
const payloadJson = JSON.stringify(payload);
const signature = crypto.sign(null, Buffer.from(payloadJson, 'utf8'), privateKey);
const token = `${Buffer.from(payloadJson, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;

// .txt, not a custom extension - WhatsApp sends it as a document without
// complaint and Windows opens it in Notepad with no missing-handler prompt.
const slug = business.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const outFile = path.join(process.cwd(), `${slug}-licence-seat${seat}.txt`);
fs.writeFileSync(
  outFile,
  [
    `Licence for ${business} (seat ${seat})`,
    `Machine: ${machine}`,
    `Issued: ${payload.ia}   Support until: ${support}`,
    '',
    token,
    '',
  ].join('\n'),
  'utf8',
);

// Kept out of git deliberately - this is the client list, and it lives next
// to the private key for the same reason: if this repo is ever made public,
// neither should be in it.
fs.mkdirSync(path.dirname(registerPath), { recursive: true });
if (!fs.existsSync(registerPath)) {
  fs.writeFileSync(registerPath, 'issued,key,seat,business,initials,machine,support_until\n');
}
fs.appendFileSync(
  registerPath,
  [payload.ia, payload.k, seat, business, initials, machine, support].join(',') + '\n',
);

console.log(`Licence written to ${outFile}`);
console.log(`Licence key: ${payload.k}`);
console.log(`  (reuse with --key ${payload.k} for this same client's other seat)`);
console.log(`Register updated: ${registerPath}`);
