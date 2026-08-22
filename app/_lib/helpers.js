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
import { isRestricted } from './licence';

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
  '/admin/lubricants': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // The drum, sold by the rupee. Its own page under Lubricants rather than a
  // nav entry - it is the same job, done from the other end.
  '/admin/lubricants/loose': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/purchases': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/stock-checks': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/customers': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // The owner's own bank money, not pump operations.
  '/admin/banking': [ROLES.SUPER_ADMIN],
  // The cash in the safe on site - the owner's own money too, and the one
  // page where a figure and a drawer full of notes are checked against each
  // other. Owner only for the same reason banking is.
  '/admin/treasury': [ROLES.SUPER_ADMIN],
  '/admin/expenses': [ROLES.SUPER_ADMIN],
  // The owner's own property, not pump operations - same reasoning as banking.
  '/admin/company-assets': [ROLES.SUPER_ADMIN],
  '/admin/reports': [ROLES.SUPER_ADMIN],
  // The day-by-day sale and stock register. Under Reports rather than in the
  // sidebar while it is still a preview - reached from the Reports page.
  '/admin/reports/register': [ROLES.SUPER_ADMIN],
  '/admin/settings': [ROLES.SUPER_ADMIN],
  // Your own login only. Managing other people's stays under /admin/settings.
  '/admin/account': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // How to use the app. Open to staff too - the person most likely to need it
  // is a new attendant on their first evening.
  '/admin/guide': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // Copy-the-data-folder backup control. Owner only, same as Settings.
  // Offline-only: there is no Supabase dashboard to take a backup from.
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
 *
 * Also where a soft-restricted licence (docs/LICENSING_PLAN.md,
 * "Restricting after the support date") is enforced - refuses same as an
 * expired session, with a message aimed at the owner rather than at staff,
 * since only the owner can actually resolve it. A handful of actions that
 * are not "new data entry" in the sense that phrase means - changing your
 * own password, taking a backup, restoring one - call
 * requireRoleIgnoringRestriction() instead; see the exemptions there for
 * why each one is exempt.
 */
async function requireRoleChecked(checkRestriction, allowedRoles) {
  const profile = await getSessionProfile();

  if (!profile) {
    throw new Error('You are signed out. Please sign in again.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    throw new Error('You do not have permission to do that.');
  }

  if (checkRestriction && isRestricted()) {
    throw new Error(
      "This licence needs renewing before new entries can be saved. Your existing data is " +
        'safe and can still be viewed or exported - contact your installer to resolve this.',
    );
  }

  return profile;
}

export async function requireRole(...allowedRoles) {
  return requireRoleChecked(true, allowedRoles);
}

/**
 * The exempted path - see the note on requireRole() above for which actions
 * use this and why. Same role check, same signed-out check; only the
 * restriction check is skipped.
 */
export async function requireRoleIgnoringRestriction(...allowedRoles) {
  return requireRoleChecked(false, allowedRoles);
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

/**
 * 140000 -> "Rs 140,000"
 *
 * The `|| 0` is not decoration. Intl rounds -0.28 to the string "-0", so a
 * customer sitting on a 28-paisa residue on the wrong side of zero had an
 * OWES column reading "Rs -0" - which looks like a bug to anyone who sees it,
 * and is one. Adding zero collapses negative zero to zero before formatting.
 */
export function formatPKR(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0';
  return `Rs ${moneyFormat.format(roundRupees(n) === 0 ? 0 : n)}`;
}

/*
 * There WAS a formatPKRExact here, showing the ledger to the paisa on the
 * reasoning that a customer account should account for every last unit.
 *
 * Removed, because Pakistan has no coin below one rupee. Nobody hands over
 * 28 paisa, so a 28-paisa balance is not a debt - it is arithmetic left over
 * from litres times a rate, and it can never be paid off. Showing it made the
 * customer page contradict itself: the headline read "Rs -5,000" through
 * formatPKR while the table under it read "Rs -4,999.72".
 *
 * The ledger now uses formatPKR like everything else, and roundRupees below
 * keeps new paisa from reaching it in the first place. Rounding only the
 * DISPLAY would have been the worse half of the fix - three hidden 0.28s add
 * up to a rupee, and the running balance would drift from the rows above it.
 *
 * Migration 021 is the database half of the same decision.
 */

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
export {
  todayISO,
  shiftISODate,
  formatDate,
  formatDateLong,
  formatDateTime,
  monthRange,
  formatMonth,
} from './date-helpers';

/*
 * Same arrangement for the formatters the client forms also need - see
 * format-helpers.js.
 */
export { formatRate, formatLitresFine } from './format-helpers';

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

/**
 * Whole rupees, for anything a person actually hands over or owes.
 *
 * The distinction against roundMoney matters and is not cosmetic:
 *
 *   roundMoney (2 dp)  - the arithmetic of the meter. litres x rate genuinely
 *                        carries paisa, and a day's sale_amount must keep them
 *                        or the takings stop reconciling against stock.
 *   roundRupees        - the customer ledger. A debt is settled with notes, and
 *                        the smallest note or coin is one rupee, so a balance
 *                        that cannot be paid in cash should never be created.
 *
 * Where a whole-rupee credit is taken out of a fractional sale, the CASH side
 * absorbs the remainder - which is right, because cash is the residual and is
 * counted in notes anyway.
 */
export function roundRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  /*
   * Half away from zero, because that is what Postgres `round()` does and what
   * Intl does when it formats. JavaScript's own Math.round rounds half toward
   * +Infinity, so Math.round(-0.5) is -0 while Postgres gives -1 - and the two
   * ends of the app would then disagree about whether an account was settled.
   * Anything that rounds a balance has to round it the same way.
   */
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(n) + Number.EPSILON);
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
