/**
 * The online half of restriction enforcement - see docs/LICENSING_PLAN.md,
 * "Restricting after the support date" for the full reasoning. Checked
 * whenever the app happens to have internet, piggybacking on the exact same
 * best-effort opportunity checkForUpdates() already uses.
 *
 * Two independent things this can catch that the offline-only clock check
 * (electron/licence.js's localClockPastSupport()) cannot:
 *   - Someone who has rolled their system clock back specifically to dodge
 *     a passed support date - this uses the HTTP response's own Date
 *     header as the timestamp instead, which the client has no way to
 *     forge.
 *   - A licence key the owner has manually revoked (chargeback, a client
 *     who stopped paying), by adding it to blocked-licences.json.
 */
const path = require('path');
const { userDataDir } = require('./config');
const { loadLicence, setRestricted } = require('./licence');

const STATUS_URL =
  'https://raw.githubusercontent.com/Ammar-Sagheer/Pump-manager-releases/main/blocked-licences.json';

function getStatusLogPath() {
  return path.join(userDataDir(), 'licence-status.log');
}

function log(line) {
  try {
    require('fs').appendFileSync(getStatusLogPath(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // A failed log write is not worth failing the actual check over.
  }
}

/**
 * Fetches the block list, decides whether THIS install should be
 * restricted, and persists that via setRestricted() - which, called from
 * here, is allowed to both set AND clear the flag (see the note on
 * setRestricted() itself for why that trust is specific to this path).
 *
 * Every failure - no internet, DNS down, GitHub unreachable, a malformed
 * response - is swallowed and logged, never thrown. This app has no
 * internet dependency for daily use; a failed status check must change
 * nothing, the same rule checkForUpdates() already follows.
 */
async function checkOnlineStatus() {
  const stored = loadLicence();
  if (!stored) return; // No verified licence yet - nothing to evaluate.

  let response;
  try {
    response = await fetch(STATUS_URL, { cache: 'no-store' });
  } catch (error) {
    log(`fetch failed: ${error.message}`);
    return;
  }
  if (!response.ok) {
    log(`unexpected status ${response.status}`);
    return;
  }

  const serverDateHeader = response.headers.get('date');
  const trustedNow = serverDateHeader ? new Date(serverDateHeader) : null;

  let body;
  try {
    body = await response.json();
  } catch (error) {
    log(`bad response body: ${error.message}`);
    return;
  }

  const blockedKeys = Array.isArray(body.blocked) ? body.blocked : [];
  const isBlocked = blockedKeys.includes(stored.payload.k);
  const isPastSupport =
    trustedNow != null && stored.payload.su != null && new Date(stored.payload.su) < trustedNow;

  const shouldRestrict = isBlocked || isPastSupport;
  setRestricted(shouldRestrict);
  log(
    `checked: blocked=${isBlocked} pastSupport=${isPastSupport} trustedNow=${trustedNow?.toISOString() ?? 'unknown'} -> restricted=${shouldRestrict}`,
  );
}

module.exports = { checkOnlineStatus };
