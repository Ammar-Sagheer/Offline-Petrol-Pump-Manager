'use client';

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

/**
 * How each day's takings split between cash in the drawer and fuel given on
 * credit.
 *
 * Two series, so a legend is always shown. The colours were checked with the
 * palette validator rather than picked by eye: green/violet separate cleanly
 * for red-green colour blindness (deutan ΔE 25.2), where the more obvious
 * green/amber pairing does not.
 *
 * Stacked segments carry a 2px stroke in the surface colour, which reads as a
 * hairline gap between them rather than one solid block.
 */
/*
 * VIOLET IS A DELIBERATE EXCEPTION to the app's palette, and it must stay.
 * The 2026 audit collapsed every decorative hue in the app onto green / amber
 * / red / slate, and the obvious move here was to make credit amber to match
 * the "money owed" colour the stat tiles use. That would be wrong: this pair
 * was chosen with a palette validator, not by eye, because green/violet
 * separates cleanly for red-green colour blindness (deutan dE 25.2) where
 * green/amber does not. Consistency does not outrank being readable by the
 * person using it.
 */
const CASH_COLOR = '#047857';
const CREDIT_COLOR = '#7c3aed';
const SURFACE = '#ffffff';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function CashCreditChart({ data, height = 260 }) {
  const points = data.map((row) => ({
    shortDay: String(row.day).slice(8, 10) + '/' + String(row.day).slice(5, 7),
    cash: Number(row.cash_amount ?? 0),
    credit: Number(row.credit_amount ?? 0),
  }));

  const allZero = points.every((point) => point.cash === 0 && point.credit === 0);

  if (points.length === 0 || allZero) {
    return (
      <p className="flex items-center justify-center rounded-lg bg-ink-50 px-4 text-sm text-ink-500"
         style={{ height }}>
        No sales recorded in this period yet.
      </p>
    );
  }

  return (
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
            content={<ChartTooltip formatValue={(value) => `Rs ${full.format(value)}`} />}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="square"
            iconSize={10}
            formatter={(value) => <span className="text-xs text-ink-600">{value}</span>}
          />
          <Bar
            dataKey="cash"
            stackId="takings"
            name="Cash"
            fill={CASH_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            maxBarSize={28}
          />
          <Bar
            dataKey="credit"
            stackId="takings"
            name="Credit"
            fill={CREDIT_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
