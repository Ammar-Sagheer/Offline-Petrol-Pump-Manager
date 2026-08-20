import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';

import { formatNumber, formatPKR, formatDate } from '@/app/_lib/helpers';
import { fuelColor } from '@/app/_lib/fuel-colors';
import Sparkline from '@/app/_components/ui/Sparkline';
import DeltaBadge from '@/app/_components/ui/DeltaBadge';

/**
 * The two cards at the top of the Sale & Stock Register, drawn on Material UI
 * `Paper` at the owner's request for that page.
 *
 * Server components: `Paper` and `Box` carry their own `'use client'`, and
 * nothing here has state, so none of this reaches the browser as our code.
 *
 * They live in their own file rather than inside the page so a disposable
 * `app/devcheck` route can render them with fixture data and screenshot them -
 * the verification discipline in CLAUDE.md - without exporting extra symbols
 * out of a `page.js`.
 */

/** brand green for a gain, red for a loss, grey for exactly nothing. */
function tones(value) {
  const n = Number(value ?? 0);
  if (n > 0)
    return {
      text: 'text-brand-700',
      chip: 'bg-brand-50 text-brand-700',
      sign: '+',
    };
  if (n < 0) return { text: 'text-red-700', chip: 'bg-red-50 text-red-700', sign: '−' };
  return { text: 'text-ink-500', chip: 'bg-ink-100 text-ink-600', sign: '' };
}

/**
 * One fuel's headline: what it sold over the chosen days, and where its stock
 * ended up against the books.
 *
 * The card wears the fuel's own colour as a band across the top and NAMES the
 * fuel in words on that band. Colour is never the only cue, and these two
 * cards sit side by side carrying four-digit numbers that look alike - the
 * same situation the Stock page's two dip boxes are written up for in
 * docs/UI_CONVENTIONS.md ("colour the whole card, name the thing twice").
 *
 * The gain/loss figure gets its own line under a rule rather than sitting
 * beside the sales figure. They are answers to different questions - how much
 * did we sell, and did the tank agree - and read side by side the smaller one
 * looks like a component of the larger.
 */
export function FuelCard({ fuelType, rows = [] }) {
  const colors = fuelColor(fuelType);
  const last = rows[rows.length - 1];

  const litres = Number(last?.cumulative_sales ?? 0);
  const variance = Number(last?.cumulative_variance ?? 0);
  const variancePct = last?.cumulative_variance_pct;
  const value = rows.reduce((sum, row) => sum + Number(row.sale_amount ?? 0), 0);

  const tone = tones(variance);

  /*
   * THE DAILY SHAPE OF WHAT THE HEADLINE TOTALS UP, from the rows this card is
   * already given - no second query, and no way for the line and the figure
   * above it to disagree about a day.
   *
   * It wears the FUEL'S OWN colour, which is the one place on this page that
   * is allowed to: the card is this fuel's card and already carries its band,
   * and docs/UI_CONVENTIONS.md -> "a card that wears a colour owns the
   * controls inside it" says everything decorative inside takes that colour or
   * stays neutral. `onWhite` is the dark relative, because diesel's real
   * #FDBA74 as a 2px line on a white card is 1.6:1 and all but invisible.
   */
  const daily = rows.map((row) => Number(row.meter_sales ?? 0));
  const dailyTips = rows.map((row) => ({
    v: `${formatNumber(Number(row.meter_sales ?? 0))} L`,
    d: formatDate(row.day),
  }));

  return (
    <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <div className={`px-4 py-2.5 text-sm font-bold uppercase tracking-wide ${colors.solid}`}>
        {colors.label}
      </div>

      <Box sx={{ px: 2.5, py: 2.5 }}>
        <p className="figure-label">Sold over these days</p>
        {/* nowrap on the whole pair: "17,504 L" broken after the number reads
            for a moment as two separate figures. */}
        <p className="tabular mt-1 whitespace-nowrap text-3xl font-bold text-ink-900">
          {formatNumber(litres)} <span className="text-xl font-semibold text-ink-600">L</span>
        </p>
        <p className="tabular mt-0.5 whitespace-nowrap text-lg font-semibold text-ink-700">
          {formatPKR(value)}
        </p>

        {/* Full width under the figures rather than tucked beside them. This
            card is half the page wide and its numbers are the largest on it,
            so there is no width to fight over here - unlike the stat tiles,
            where the sparkline has to yield to the figure. Two days is the
            fewest that can show a direction; below that Sparkline draws
            nothing and this is simply absent. */}
        {daily.length > 1 ? (
          <span className={`mt-3 block ${colors.onWhite}`}>
            <Sparkline data={daily} tips={dailyTips} className="h-10 w-full" width={240} />
          </span>
        ) : null}

        <hr className="my-3 border-ink-100" />

        <p className="figure-label">Stock gain / loss over these days</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className={`tabular whitespace-nowrap text-2xl font-bold ${tone.text}`}>
            {tone.sign}
            {formatNumber(Math.abs(variance))} L
          </span>
          {variancePct === null || variancePct === undefined ? null : (
            <span className={`badge whitespace-nowrap ${tone.chip}`}>
              {tones(variancePct).sign}
              {Math.abs(Number(variancePct)).toFixed(2)}% of what was sold
            </span>
          )}
        </div>
      </Box>
    </Paper>
  );
}

/**
 * A money figure on the register page.
 *
 * Deliberately the same shape and the same type sizes as `StatTile`, drawn on
 * a MUI `Paper` instead of the app's `.card`, so the MUI page does not use
 * half of one system and half of another. If this page graduates from a
 * preview, the right move is to pick one of the two and delete the other -
 * not to leave both.
 */
export function MoneyTile({
  label,
  value,
  tone = 'default',
  spark,
  sparkTips,
  sparkTone,
  delta,
}) {
  const valueTone =
    tone === 'positive' ? 'text-brand-700' : tone === 'negative' ? 'text-red-700' : 'text-ink-900';

  return (
    <Paper elevation={3} sx={{ borderRadius: 3, px: 2.5, py: 2.5 }}>
      <p className="figure-label">{label}</p>
      {/* Figure and line share a row, the same shape as StatTile - the figure
          keeps the left edge and the line takes what is left. `min-w-0` on the
          chart side and `flex-1 max-w-[72px]`, so it is the sparkline that
          gives way when a seven-figure total needs the width, never the
          number. */}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <p className={`tabular whitespace-nowrap text-xl font-bold @[50rem]:text-2xl ${valueTone}`}>
          {value}
        </p>
        {spark ? (
          <span
            className={`block w-full @[62rem]:w-auto @[62rem]:max-w-[72px] @[62rem]:flex-1 ${sparkTone ?? 'text-ink-400'}`}
          >
            <Sparkline data={spark} tips={sparkTips} className="h-8 w-full @[62rem]:h-[34px]" />
          </span>
        ) : null}
      </div>
      {delta ? <DeltaBadge {...delta} /> : null}
    </Paper>
  );
}
