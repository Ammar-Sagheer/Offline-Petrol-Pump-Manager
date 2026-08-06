/**
 * The business's own name and mark, in one place.
 *
 * FALLBACKS ONLY, as of docs/LICENSING_PLAN.md. The real values now come
 * from the signed licence token (app/_lib/licence.js:
 * licensedBusinessName()/licensedBusinessInitials()) - these constants are
 * what shows before activation, during a grace period, and in a plain
 * `npm run dev` with no token at all. Deliberately neutral: hard-coding one
 * client's name here is the exact bug licensing was built to fix - every
 * install used to say "Mubeen Petroleum Service" regardless of who it was
 * actually licensed to.
 *
 * Plain constants with no imports, so this can still be pulled into a Server
 * Component, a Client Component and the Excel report alike - unlike
 * helpers.js, which reaches into request cookies and is server-only.
 */
export const BUSINESS_NAME = 'Pump Manager';

/** Shown when the logo file is missing, so the header is never empty. */
export const BUSINESS_INITIALS = 'PM';

/**
 * Where the logo lives. Anything Next serves from /public works - drop a file
 * in as public/logo.png and it appears; take it away and the initials come
 * back. No code change either way.
 */
export const LOGO_SRC = '/logo.png';
