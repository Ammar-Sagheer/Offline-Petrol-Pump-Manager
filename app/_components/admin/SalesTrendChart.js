'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import ChartTooltip from '@/app/_components/admin/ChartTooltip';

/**
 * Daily sales over a date range.
 *
 * One series, so there is no legend - the heading names it. Bars carry rounded
 * tops anchored to the baseline, and the grid is horizontal only so it stays
 * behind the data rather than competing with it.
 */
const BAR_COLOR = '#0f766e';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function SalesTrendChart({ data, height = 260 }) {
  const points = data.map((row) => ({
    day: row.day,
    shortDay: String(row.day).slice(8, 10) + '/' + String(row.day).slice(5, 7),
    sale: Number(row.sale_amount ?? 0),
  }));

  const allZero = points.every((point) => point.sale === 0);

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
          <Bar
            dataKey="sale"
            name="Sales"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
