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

/**
 * Litres to the millilitre: 0.0345 -> "0.035 L".
 *
 * For loose oil only. `formatLitres` stops at two decimals, which is right for
 * a shelf - "4 L", "0.25 L" - but turns every rupee-priced pour out of a drum
 * into "0.03 L", and two sales of different sizes into the same string. The
 * third decimal is not decoration here; it is the difference between the
 * figures.
 *
 * Trailing zeros are kept off, so a whole litre off the drum still reads "1 L"
 * rather than "1.000 L".
 */
const fineLitreFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatLitresFine(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0 L';
  return `${fineLitreFormat.format(n)} L`;
}

/**
 * Litres × rate, to the paisa, computed the way POSTGRES computes it.
 *
 * THIS EXISTS BECAUSE A READING WOULD NOT SAVE. Unit 1 Nozzle A on 23 Aug:
 * opening 1,990,670.61, closing 1,990,868.36, diesel at Rs 371.90. That is
 * 197.75 litres, and 197.75 × 371.90 is exactly Rs 73,543.2250 — a half-paisa,
 * dead on the rounding boundary.
 *
 *   Postgres  numeric, exact:   73543.2250 -> round(...,2) -> 73543.23
 *   JavaScript float:           73543.224999999991...      -> 73543.22
 *
 * `sale_amount` is a GENERATED column, so the database computes .23 and the app
 * sent .22, and the check constraint that cash + credit must equal the amount
 * sold refused the row — by one paisa, with a message about the figures not
 * adding up that no amount of re-typing could fix. Whole litres never hit it:
 * a whole number × a two-decimal rate cannot land on a half-paisa. The owner's
 * decimals could, and did.
 *
 * The fix in the DATABASE is migration 036 (reference 052), which derives cash
 * inside `create_nozzle_reading()` instead of trusting what the app worked
 * out — the same reasoning that already had it derive the credit total from
 * the slips. This function is the other half: what the SCREEN shows while the
 * reading is being typed has to be the figure that is about to be saved, or
 * the owner checks Rs 73,543.22 against the drawer and the books say .23.
 *
 * HOW. Scale both sides to integers, multiply exactly, then round half AWAY
 * FROM ZERO on the paisa — which is what Postgres `round()` does, and what
 * `roundRupees` in helpers.js already matches for the ledger.
 *
 * Litres are scaled by a THOUSAND, not a hundred. A meter reading is two
 * decimals so a nozzle's litres are too, but loose oil is measured to three
 * (`lubricant_sales.litres` is `numeric(12,3)`), and a helper that silently
 * rounded 12.345 litres to 12.35 before multiplying would be a worse bug than
 * the one it was written to fix — quiet, and only on the drum. The widest real
 * input, a six-figure litre count at a three-figure rate, is about 1e13: an
 * exact integer in a double, three orders of magnitude clear of 2^53.
 *
 * Never `litres * rate` in floating point again for a figure the database also
 * computes.
 */
export function saleAmount(litres, rate) {
  const l = Math.round(Number(litres) * 1000);
  const r = Math.round(Number(rate) * 100);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;

  // Scaled by 100,000: three decimals of litres, two of rate.
  const scaled = l * r;
  const sign = scaled < 0 ? -1 : 1;
  const abs = Math.abs(scaled);

  // The last three digits are the fraction of a paisa; half rounds up.
  const paisa = Math.floor(abs / 1000) + (abs % 1000 >= 500 ? 1 : 0);
  return (sign * paisa) / 100;
}
