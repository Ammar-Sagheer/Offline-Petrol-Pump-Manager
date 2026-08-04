/**
 * `next build` with `output: 'standalone'` produces a self-contained server
 * under .next/standalone, but deliberately leaves out static assets and the
 * public/ folder - Next expects a reverse proxy or CDN to serve those in a
 * normal deployment. There is no such thing here, so this copies both in,
 * exactly where the standalone server.js expects to find them.
 *
 * Runs automatically after `next build` (see package.json's "postbuild").
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
}

copyIfExists(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
copyIfExists(path.join(root, 'public'), path.join(standaloneDir, 'public'));

console.log('[postbuild] copied static assets into .next/standalone');
