/**
 * Server-side role checks, formatting and the small calculations used across
 * the app.
 *
 * IMPORTANT: this module reaches into request cookies via auth.js, so it can
 * only be imported from Server Components and Server Actions. Client
 * Components that need to format a number as they type do it inline with
 * Intl instead - see ReadingForm.
 */
import { redirect } from 'next/navigation';
import { getSessionProfile } from './auth';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DATA_ENTRY: 'data_entry',
};

/**
 * Which routes each role may open. The nav uses this to hide what a user
 * cannot reach, but hiding a link is only cosmetic - the real enforcement is
 * the RLS policies in the database, with requireRole() as a second layer.
 */
export const ROUTE_ACCESS = {
  '/admin': [ROLES.SUPER_ADMIN],
  '/admin/readings': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/purchases': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/stock-checks': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/customers': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // The owner's own bank money, not pump operations.
  '/admin/banking': [ROLES.SUPER_ADMIN],
  '/admin/reports': [ROLES.SUPER_ADMIN],
  '/admin/settings': [ROLES.SUPER_ADMIN],
  // Your own login only. Managing other people's stays under /admin/settings.
  '/admin/account': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // Copy-the-data-folder backup control. Owner only, same as Settings.
  '/admin/backup': [ROLES.SUPER_ADMIN],
};

/** Where a role lands after logging in. */
export function landingPageFor(role) {
  return role === ROLES.SUPER_ADMIN ? '/admin' : '/admin/readings';
}

// ---------------------------------------------------------------------------
// Authentication and roles
// ---------------------------------------------------------------------------

export { getSessionProfile };

/**
 * requireRole - the guard to call at the top of EVERY Server Action.
 *
 * Throws rather than redirecting, because an action should fail loudly and let
 * the caller turn it into a message on the form. Pages use requirePageRole()
 * instead, which redirects.
 *
 *   const profile = await requireRole(ROLES.SUPER_ADMIN);
 *   const profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
 *
 * This is defence in depth, not the actual protection: even if this check were
 * missing, the RLS policies would still refuse the write.
 */
export async function requireRole(...allowedRoles) {
  const profile = await getSessionProfile();

  if (!profile) {
    throw new Error('You are signed out. Please sign in again.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    throw new Error('You do not have permission to do that.');
  }

  return profile;
}

/**
 * Page-level guard: redirects instead of throwing, so a staff member who opens
 * a super_admin URL gets bounced somewhere useful rather than an error screen.
 */
export async function requirePageRole(...allowedRoles) {
  const profile = await getSessionProfile();

  if (!profile) {
    redirect('/admin/login');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    redirect(landingPageFor(profile.role));
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Formatting
//
// Grouping is en-US style (140,000). If you would rather see the South Asian
// lakh style (1,40,000), change 'en-US' to 'en-IN' in the two formatters below.
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 140000 -> "Rs 140,000" */
export function formatPKR(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0';
  return `Rs ${moneyFormat.format(n)}`;
}

/** 140000 -> "Rs 140,000.50" - for a ledger, where every paisa should show. */
export function formatPKRExact(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0';
  return `Rs ${numberFormat.format(n)}`;
}

/** 500 -> "500 L" */
export function formatLitres(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0 L';
  return `${numberFormat.format(n)} L`;
}

export function formatNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? numberFormat.format(n) : '0';
}

/*
 * Dates live in date-helpers.js so the client forms can import the same
 * implementation - this module cannot go in a browser bundle. Re-exported here
 * so server code can keep importing them from helpers as before.
 */
export { todayISO, shiftISODate, formatDate, monthRange, formatMonth } from './date-helpers';

/**
 * Whether the "empty everything" button exists on this build.
 *
 * Scaffolding for trying the app out before trusting it with real data.
 * Deliberately NOT a NEXT_PUBLIC_ variable: those are baked into the browser
 * bundle at build time, so the flag would ship to anyone who looked. Read here
 * on the server only, by both the Settings page (to decide whether to draw the
 * button) and the action itself (to decide whether to obey it) - the button
 * being hidden is presentation, this check is the actual gate.
 */
export function fullResetAllowed() {
  return process.env.ALLOW_FULL_RESET === 'true';
}

// ---------------------------------------------------------------------------
// Calculations
//
// The database computes these too, as generated columns. These exist so the
// forms can show a running total as someone types. Postgres remains the source
// of truth - if the two ever disagree, the database is right.
// ---------------------------------------------------------------------------

/** Money is rounded to 2 decimals the same way Postgres rounds it. */
export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function litresSold(opening, closing) {
  const sold = Number(closing) - Number(opening);
  return Number.isFinite(sold) ? roundMoney(sold) : 0;
}

export function saleAmount(litres, ratePerLitre) {
  return roundMoney(Number(litres) * Number(ratePerLitre));
}

/** Positive = the customer owes money. */
export function ledgerBalance(entries = []) {
  return roundMoney(
    entries.reduce(
      (total, entry) =>
        total + (entry.entry_type === 'debit' ? Number(entry.amount) : -Number(entry.amount)),
      0,
    ),
  );
}
