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
import { fuelColor } from '@/app/_lib/fuel-colors';

/**
 * Day by day, what the shelf took and what the drum took.
 *
 * Built to sit beside the fuel charts and be read the same way: same bar shape,
 * same axes, same compact tick format, rupees on the Y axis. Only the series
 * differ.
 *
 * STACKED, NOT SIDE BY SIDE. The two together are "what the oil side of the
 * business did today", and the owner wants that total as well as the split -
 * which a stack gives for free and paired bars do not. It is the same argument
 * CashCreditChart makes for cash and credit.
 *
 * The colours are the pair already validated for this app: brand green against
 * violet, which stays separable for red-green colour blindness where the
 * obvious green/amber does not. Reusing that pair rather than picking a third
 * scheme also means a green block means "the ordinary case" on every chart on
 * the page.
 *
 * PLOTTED IN RUPEES, deliberately. Litres would put 12 L off the shelf beside
 * 0.4 L out of the drum and render the drum as a flat line - and the drum's
 * litres are derived from a rate anyway, so they are the softer number. In
 * money the two are comparable, which is the whole reason to chart them
 * together.
 */
/*
 * BOTH SERIES ARE LUBRICANT'S OWN COLOUR, one light and one dark.
 *
 * This was brand green for packed and violet for loose - two hues borrowed
 * from the chrome to separate two halves of ONE product. On a chart headed
 * "Oil sales" that is backwards: the reader's first question is which bar is
 * oil, and neither colour answered it. Gold does, and it is the colour
 * lubricant already wears on its badge and its stat-tile glyph.
 *
 * THE PAIR IS SEPARATED BY LIGHTNESS, NOT HUE, and it is separated as far as
 * the family allows: `#655216` is lubricant's DARKEST gold (the one its text
 * on white uses) against `#D4AF37`, its vivid one. The first pass used the
 * middle `#977B20` and the two blocks sat too close to tell apart in a
 * stacked bar; this is the widest lightness gap available without leaving the
 * hue. Both are in fuel-colors.js. That
 * is deliberate: two hues would have been a second colour decision inside a
 * product that owns one, and a lightness step survives red-green colour
 * blindness where two hues of similar value do not. Stacked one on top of the
 * other in the same bar, a light block over a dark one reads as two parts of
 * a whole, which is what packed and loose are.
 *
 * The legend still names both, so the colour is never carrying it alone.
 */
const LUBRICANT = fuelColor('lubricant');
const PACK_COLOR = LUBRICANT.deepHex;
const LOOSE_COLOR = LUBRICANT.raw;
const SURFACE = '#ffffff';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function LubricantTrendChart({ data, height = 260 }) {
  const points = data.map((row) => ({
    shortDay: String(row.day).slice(8, 10) + '/' + String(row.day).slice(5, 7),
    pack: Number(row.pack_amount ?? 0),
    loose: Number(row.loose_amount ?? 0),
  }));

  const allZero = points.every((point) => point.pack === 0 && point.loose === 0);

  if (points.length === 0 || allZero) {
    return (
      <p
        className="flex items-center justify-center rounded-lg bg-ink-50 px-4 text-center text-sm text-ink-500"
        style={{ height }}
      >
        No oil sold in this period yet.
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
            dataKey="pack"
            stackId="oil"
            name="Packed"
            fill={PACK_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            maxBarSize={28}
          />
          <Bar
            dataKey="loose"
            stackId="oil"
            name="Loose oil"
            fill={LOOSE_COLOR}
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
