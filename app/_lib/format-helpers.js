/**
 * Formatting that has to be identical on the server AND in the browser.
 *
 * Lives apart from helpers.js for the same reason date-helpers.js does: that
 * module reads request cookies for the role checks (via auth.js), so it can
 * never be pulled into a client bundle - which left client components writing
 * their own formatting inline, and drifting. helpers.js re-exports what is
 * here, so server code carries on importing from there.
 */

/**
 * A per-litre rate, always to the paisa: 339.5 -> "Rs 339.50".
 *
 * Deliberately NOT formatPKR, which rounds to whole rupees. That is right for
 * a day's takings, where the paisa are noise beside Rs 140,000 - and wrong for
 * a rate, where the whole figure is three digits and the paisa are part of the
 * price on the board outside. Rs 339.48 shown as "Rs 339" is a different price.
 *
 * Both minimum and maximum are 2, so a round rate shows as "Rs 339.00" rather
 * than "Rs 339" - a price list where some rows carry paisa and others do not
 * reads as though the app dropped them on the ones that do not.
 */
const rateFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRate(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0.00';
  return `Rs ${rateFormat.format(n)}`;
}
