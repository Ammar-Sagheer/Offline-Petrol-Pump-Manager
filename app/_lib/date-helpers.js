/**
 * Date helpers that are safe on BOTH the server and in the browser.
 *
 * These live apart from helpers.js on purpose. helpers.js reads request cookies
 * for the role checks, so it can never be pulled into a browser bundle - which
 * left the client forms inlining their own date logic, and getting it wrong.
 * One implementation, imported from both sides, cannot drift.
 *
 * helpers.js re-exports everything here, so server code can keep importing from
 * there as before.
 */

/**
 * Where the pump is. The business day is decided by this, not by the clock on
 * whatever machine happens to be asking.
 *
 * Change this one line if the pump ever moves to another timezone.
 */
export const PUMP_TIMEZONE = 'Asia/Karachi';

/**
 * Today at the pump, as 'YYYY-MM-DD' - what <input type="date"> and Postgres
 * `date` columns both expect.
 *
 * Two traps this avoids, both of which file entries against the wrong day:
 *
 *   1. `toISOString().slice(0, 10)` converts to UTC first. In Pakistan (UTC+5)
 *      every date field would default to YESTERDAY between midnight and 5am, so
 *      a payment taken at 1am lands on the previous day.
 *   2. Relying on the machine's own clock. The browser sits in Pakistan, but a
 *      Vercel server runs in UTC - so the two would disagree for those same
 *      five hours, and the date shown would not match the date saved.
 *
 * Pinning to the pump's timezone makes server and browser always agree, and
 * means checking the books from another country still shows the pump's day.
 * 'en-CA' is used because it formats as YYYY-MM-DD.
 */
const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PUMP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayISO() {
  return isoDateFormatter.format(new Date());
}

/**
 * Shift an ISO date string by whole days.
 *
 * Built in UTC on purpose: the string is a plain calendar date with no time in
 * it, so doing the arithmetic in UTC keeps a daylight-saving change or a
 * timezone offset from nudging it onto the wrong day.
 */
export function shiftISODate(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The first and last calendar day of a month, as ISO strings.
 *
 * `Date.UTC(year, month, 0)` is day zero of the FOLLOWING month, which is the
 * last day of this one - so February and leap years come out right without a
 * table of month lengths.
 */
export function monthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                     'August', 'September', 'October', 'November', 'December'];

/** '2026-08' or (2026, 8) -> "August 2026". */
export function formatMonth(year, month) {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/**
 * '2026-08-03' -> "03 Aug 2026".
 *
 * Parsed by splitting the string rather than with `new Date(value)`, which would
 * read it as UTC midnight and then print the previous day for anyone west of
 * Greenwich.
 */
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}
