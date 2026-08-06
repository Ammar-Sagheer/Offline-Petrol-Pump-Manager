#!/usr/bin/env node
/**
 * Run once, by hand, by the owner. Generates the Ed25519 keypair the whole
 * licensing scheme rests on - see docs/LICENSING_PLAN.md.
 *
 * Writes the PUBLIC key to licence-key.json at the repo root (committed -
 * every installed app ships it, to verify tokens against). Writes the
 * PRIVATE key to ~/.pump-manager/private.pem (never committed - lose it and
 * no new client can ever be licensed; leak it and the whole scheme is void).
 *
 * Re-running this when a keypair already exists at either location refuses,
 * rather than silently overwriting a key that licences have already been
 * issued against.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const privateKeyPath =
  process.argv.find((arg) => arg.startsWith('--private-key='))?.slice('--private-key='.length) ||
  path.join(os.homedir(), '.pump-manager', 'private.pem');
const publicKeyPath = path.join(__dirname, '..', 'licence-key.json');

if (fs.existsSync(privateKeyPath)) {
  console.error(`Refusing to overwrite an existing private key at ${privateKeyPath}.`);
  console.error('Delete it yourself first if you really mean to replace it - every licence');
  console.error('issued against the old key would stop verifying.');
  process.exit(1);
}
if (fs.existsSync(publicKeyPath)) {
  console.error(`Refusing to overwrite an existing ${publicKeyPath}.`);
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });
fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
  mode: 0o600,
});

fs.writeFileSync(
  publicKeyPath,
  JSON.stringify(
    { publicKey: publicKey.export({ type: 'spki', format: 'pem' }) },
    null,
    2,
  ) + '\n',
);

console.log(`Private key written to ${privateKeyPath} - back it up (password manager plus one`);
console.log('offline copy) and never commit it.');
console.log(`Public key written to ${publicKeyPath} - commit this one.`);
