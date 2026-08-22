'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import ChartTooltip from '@/app/_components/admin/ChartTooltip';

/**
 * What went into the safe each day, what came out, and what it was left
 * holding.
 *
 * WHY ALL THREE ON ONE CHART. The safe's balance on its own is a line that
 * falls off a cliff and climbs back, and it never says why. The movements on
 * their own say why and never say whether the safe was nearly empty at the
 * time. Read off two charts that is arithmetic; read off one it is a picture.
 *
 * THE BARS ARE MOVEMENTS AND THE LINE IS A LEVEL, and they are coloured to
 * say so. The two bars take the app's validated two-series pair - green and
 * violet, checked with the palette validator rather than picked by eye,
 * because green/amber does not separate for red-green colour blindness (see
 * CashCreditChart, which uses the same pair for the same reason). The balance
 * line is deliberately NOT a third hue: it is slate, the app's neutral, so it
 * reads as the thing the two coloured series add up to rather than as a third
 * kind of movement.
 *
 * ONE Y AXIS, because both are rupees. Two axes would let a small movement be
 * drawn taller than a large balance, which is the standard way a combined
 * chart lies.
 *
 * Everything on it is formatted here in the browser with Intl rather than by
 * helpers.js - that module reads request cookies and cannot enter a client
 * bundle.
 */
const IN_COLOR = '#047857';
const OUT_COLOR = '#7c3aed';
const BALANCE_COLOR = '#334155';
const SURFACE = '#ffffff';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function TreasuryBalanceChart({ daily, height = 300 }) {
  const points = (daily ?? []).map((row) => ({
    shortDay: `${String(row.day).slice(8, 10)}/${String(row.day).slice(5, 7)}`,
    cashIn: Number(row.cash_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    closing: Number(row.closing ?? 0),
  }));

  if (points.length < 2) {
    return (
      <p
        className="flex items-center justify-center rounded-lg bg-ink-50 px-4 text-sm text-ink-500"
        style={{ height }}
      >
        Not enough days recorded yet to draw a trend.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
            dataKey="cashIn"
            name="Cash in"
            fill={IN_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="cashOut"
            name="Cash out"
            fill={OUT_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          {/* Drawn last so it sits over the bars, and given a white halo by the
              dot's own stroke - a 2px dark line crossing a violet bar is
              otherwise hard to follow at tablet brightness. */}
          <Line
            type="monotone"
            dataKey="closing"
            name="In the safe at close"
            stroke={BALANCE_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, fill: BALANCE_COLOR, stroke: SURFACE, strokeWidth: 1.5 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
