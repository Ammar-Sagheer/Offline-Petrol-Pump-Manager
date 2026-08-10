/**
 * Local, per-install configuration: where the data lives, and the secrets this
 * install generated for itself on first run.
 *
 * None of this is ever checked into git or shipped in the installer - it is
 * created once, on the user's own machine, and lives next to the database it
 * describes. Losing this file without losing the data folder is a problem (the
 * database role passwords would no longer be known), which is why backups have
 * to carry both.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function userDataDir() {
  // Per-OS: %APPDATA%/<productName> on Windows,
  // ~/Library/Application Support/<productName> on macOS,
  // ~/.config/<productName> on Linux.
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
 * Loads config.json, creating it with fresh secrets on first run. Ports are
 * fixed rather than random: a different port each launch breaks nothing at
 * runtime but makes every log and bug report harder to compare. Pick
 * uncommon ones so they don't collide with something the user runs.
 */
function loadOrCreateConfig() {
  const file = configPath();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  fs.mkdirSync(userDataDir(), { recursive: true });
  const config = {
    pgPort: 55432,
    nextPort: 34117,
    pgSuperPassword: randomSecret(24),
    appUserPassword: randomSecret(24),
    sessionSecret: randomSecret(32),
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

module.exports = { userDataDir, dbDataDir, configPath, loadOrCreateConfig };
