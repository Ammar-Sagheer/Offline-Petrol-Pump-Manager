/**
 * Local, per-install configuration: where the data lives, and the secrets
 * this install generated for itself on first run.
 *
 * Nothing here is ever checked into git or shipped in the installer - it is
 * created once, on the client's own machine, the first time the app runs, and
 * lives next to the database it describes. Losing this file without losing
 * db-data/ would be a problem (the app_user password would no longer be
 * known), so both are backed up together - see the note in
 * app/admin/backup/page.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function userDataDir() {
  // app.getPath('userData') is per-OS: %APPDATA%/... on Windows,
  // ~/Library/Application Support/... on macOS, ~/.config/... on Linux.
  return app.getPath('userData');
}

function dbDataDir() {
  return path.join(userDataDir(), 'db-data');
}

function configPath() {
  return path.join(userDataDir(), 'config.json');
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Loads config.json, creating it with freshly generated secrets if this is
 * the first run. The Postgres superuser password only matters for the
 * lifetime of one running instance of the embedded server - it is not needed
 * to read the data directory any other way - but it is persisted anyway so
 * restarting the app does not require re-initialising the cluster.
 */
function loadOrCreateConfig() {
  const file = configPath();

  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  fs.mkdirSync(userDataDir(), { recursive: true });

  const config = {
    pgPort: 55432,
    pgSuperPassword: randomSecret(24),
    appUserPassword: randomSecret(24),
    sessionSecret: randomSecret(32),
    nextPort: 34117,
  };

  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

module.exports = { userDataDir, dbDataDir, configPath, loadOrCreateConfig };
