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

/** The neutral mark, shown before activation and in a plain `npm run dev`. */
export const BUSINESS_INITIALS = 'PM';

/*
 * THERE IS NO LOGO_SRC ANY MORE. It pointed at public/logo.png, and whatever
 * file sat there shipped inside the installer to every client alike - so an
 * install licensed to one business wore another's logo, the same bug that
 * BUSINESS_NAME above was moved into the licence to fix. The mark is now
 * drawn from the licensed initials instead (BrandMark.js), which are per
 * install and need no file. Putting a single image back would bring the
 * original bug back with it; a genuinely per-client logo would have to
 * travel in the licence token or sit in the app data folder, not in the
 * build.
 */
