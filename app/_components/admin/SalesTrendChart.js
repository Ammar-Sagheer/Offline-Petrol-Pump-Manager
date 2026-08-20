'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import ChartTooltip from '@/app/_components/admin/ChartTooltip';
import { FUEL_COLORS } from '@/app/_lib/fuel-colors';

/**
 * Daily fuel sales, in rupees or in litres.
 *
 * WHY THE TOGGLE EXISTS. In rupees this chart and the cash-vs-credit one
 * beside it were drawing the same picture: on a pump where nearly everything
 * is paid in cash, "total sales" and "the cash bar" are the same height every
 * day, and the second chart added nothing. Litres is the view the money cannot
 * give you — it is the only one where a rate change does not move the bars, so
 * a quiet day is visible as a quiet day rather than as a cheaper day.
 *
 * SPLIT BY FUEL, because the two move independently and the split is the
 * question the owner actually has. Stacked rather than side by side, so the
 * height still reads as "how big was the day" the way the rupee view does, and
 * the mix is legible inside it.
 *
 * CLIENT STATE, NOT A QUERY STRING — unlike `<TrendRange>` next to it, which
 * changes the window and therefore needs a new query. Both views here come out
 * of rows the page has already fetched (`get_sales_trend` returns
 * `petrol_litres` and `diesel_litres` alongside the money), so a round trip to
 * redraw the same data would be a spinner in exchange for nothing.
 *
 * The colours come from `app/_lib/fuel-colors.js`, the app's single definition
 * of what petrol and diesel look like, so a bar means the same fuel here as the
 * badge does on every table. They were previously retyped as literals and had
 * already drifted from the badges. They also carry the word in the legend: this
 * is a blue/orange pair, and colour is never the only cue.
 *
 * The single-series "Sales" bar takes the app's primary green. It was a lone
 * teal, which was a hue this app used nowhere else - and with petrol now blue,
 * a teal bar sat close enough to read as "some kind of petrol".
 */
const SALE_COLOR = '#047857';
const PETROL_COLOR = FUEL_COLORS.petrol.hex;
const DIESEL_COLOR = FUEL_COLORS.diesel.hex;
const SURFACE = '#ffffff';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const litres = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export default function SalesTrendChart({ data, height = 260 }) {
  const [mode, setMode] = useState('money');
  const showingLitres = mode === 'litres';

  const points = data.map((row) => ({
    day: row.day,
    shortDay: String(row.day).slice(8, 10) + '/' + String(row.day).slice(5, 7),
    sale: Number(row.sale_amount ?? 0),
    petrol: Number(row.petrol_litres ?? 0),
    diesel: Number(row.diesel_litres ?? 0),
  }));

  /* Emptiness is judged on the series being shown. A period can hold readings
     whose litres are all zero only if nothing was sold at all, so in practice
     these agree - but asking the wrong one would put "no sales" over a chart
     that has bars in the other mode. */
  const allZero = showingLitres
    ? points.every((point) => point.petrol === 0 && point.diesel === 0)
    : points.every((point) => point.sale === 0);

  return (
    <>
      <ModeToggle mode={mode} onChange={setMode} />

      {points.length === 0 || allZero ? (
        <p
          className="flex items-center justify-center rounded-lg bg-ink-50 px-4 text-sm text-ink-500"
          style={{ height }}
        >
          No sales recorded in this period yet.
        </p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="shortDay"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value) => compact.format(value)}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                content={
                  <ChartTooltip
                    formatValue={(value) =>
                      showingLitres ? `${litres.format(value)} L` : `Rs ${full.format(value)}`
                    }
                  />
                }
              />

              {showingLitres ? (
                <>
                  {/* A legend only where there are two series to tell apart.
                      In rupees the heading already names the one bar. */}
                  <Legend
                    verticalAlign="top"
                    height={24}
                    iconType="square"
                    wrapperStyle={{ fontSize: 12, color: '#475569' }}
                  />
                  {/* Only the top segment is rounded, or the corner of the
                      lower one cuts a notch into the one above it. */}
                  <Bar
                    dataKey="petrol"
                    name="Petrol"
                    stackId="litres"
                    fill={PETROL_COLOR}
                    stroke={SURFACE}
                    strokeWidth={2}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="diesel"
                    name="Diesel"
                    stackId="litres"
                    fill={DIESEL_COLOR}
                    stroke={SURFACE}
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </>
              ) : (
                <Bar
                  dataKey="sale"
                  name="Sales"
                  fill={SALE_COLOR}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

/**
 * Rupees or litres.
 *
 * A pair of buttons rather than the chip rows elsewhere in the app, because
 * those navigate and this does not - it flips state the page already holds.
 * `aria-pressed` is what says which is on; the fill is the second cue.
 */
function ModeToggle({ mode, onChange }) {
  const options = [
    ['money', 'Rupees'],
    ['litres', 'Litres'],
  ];

  return (
    <div
      role="group"
      aria-label="Show the trend in rupees or litres"
      className="mb-3 inline-flex gap-1 rounded-lg border border-ink-300 bg-white p-0.5"
    >
      {options.map(([value, label]) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={[
              'rounded-md px-3 py-1 text-sm font-semibold transition',
              active
                ? 'bg-brand-600 text-white'
                : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
