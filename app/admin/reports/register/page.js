import { Fragment } from 'react';

import Chip from '@mui/material/Chip';

import { requirePageRole, ROLES, todayISO, formatDate, formatPKR } from '@/app/_lib/helpers';
import {
  getStockRegister,
  getRangeSummary,
  getSalesTrend,
  getPurchaseTotalsByDay,
  getExpenseTotalsByDay,
} from '@/app/_lib/data-service';
import { fuelColor, byFuelOrder } from '@/app/_lib/fuel-colors';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import RegisterRange from '@/app/_components/admin/RegisterRange';
import RegisterTable from '@/app/_components/admin/RegisterTable';
import { FuelCard, MoneyTile } from '@/app/_components/admin/RegisterSummary';

export const metadata = { title: 'Sale & stock register' };

/**
 * The Daily Sale & Stock Register.
 *
 * The owner keeps this as a spreadsheet - one row per trading day per tank,
 * with the running sales and the running gain/loss beside each other - and the
 * two cumulative columns are the whole point of it. A single day's variance is
 * a person squinting at a wet dipstick; ±30 L on a 5,000 L tank is the
 * measurement, not the fuel. A leak or a theft shows up as a cumulative
 * variance that walks in one direction and a percentage that will not come
 * back towards zero, and neither the Stock page (one day) nor Reports (one
 * whole month, one total) can show that.
 *
 * A PREVIEW, and it says so on the page. The owner asked for somewhere to
 * check the shape of this before it becomes a proper part of the app, so it is
 * reachable from Reports rather than from the sidebar, and the banner at the
 * top says what it is. Everything on it is real data through the same RLS and
 * the same role checks as every other page - "for testing" describes the
 * design, not the numbers.
 *
 * Rendered with Material UI at the owner's request. `RegisterTable` explains
 * why almost none of it is a Client Component despite that.
 */

/**
 * Day 1 to TODAY in the current month; day 1 to the last day in any other.
 *
 * The default used to be the whole month either way, which on the 3rd of
 * August meant a register headed "01 Aug - 31 Aug" with twenty-eight empty
 * days hanging off the bottom of it - and a profit figure comparing three
 * days of sales against whatever deliveries had landed, over a span the
 * heading said was a month. A register's most common question is "how are we
 * doing so far", and so far ends today.
 *
 * A PAST month still defaults to all of it, because there "so far" and "the
 * whole month" are the same span, and clamping to today's day-of-month would
 * cut June short at the 15th for no reason.
 */
function resolveRange(params) {
  const today = todayISO();

  const month =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  /*
   * Clamped to the month, never trusted. `?from=0` would ask Postgres for a
   * date of "2026-08-00" and `?from=400` for four hundred days of rows - the
   * same lesson TrendRange's note records about validating against the allowed
   * set rather than `Number() || 14`.
   */
  const clamp = (value, fallback) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > lastDay) return fallback;
    return n;
  };

  /* `today.slice(8)` is the day-of-month in Asia/Karachi, which is what
     todayISO() is pinned to - not the server's clock. See date-helpers.js. */
  const isCurrentMonth = month === today.slice(0, 7);
  const defaultToDay = isCurrentMonth ? Math.min(Number(today.slice(8, 10)), lastDay) : lastDay;

  let fromDay = clamp(params?.from, 1);
  let toDay = clamp(params?.to, defaultToDay);

  // Entered backwards, they are swapped rather than refused. The reader asked
  // for the days between two numbers and that is unambiguous either way round.
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

  const pad = (n) => String(n).padStart(2, '0');

  return {
    month,
    fromDay,
    toDay,
    from: `${month}-${pad(fromDay)}`,
    to: `${month}-${pad(toDay)}`,
    days: toDay - fromDay + 1,
  };
}

/**
 * The equally long span ending the day before this one starts.
 *
 * Worked out in UTC on purpose: these are plain calendar dates with no clock
 * attached, and `Date.UTC` is the one arithmetic that cannot be shifted by the
 * server's timezone. The business day is pinned to Asia/Karachi elsewhere (see
 * date-helpers.js) but that matters for deciding WHICH day it is now, not for
 * counting backwards from a date already chosen.
 */
function previousRange(range) {
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() - 1);
  start.setUTCDate(start.getUTCDate() - range.days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default async function RegisterPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const range = resolveRange(params);

  /*
   * THE SPAN BEFORE THIS ONE, of exactly the same length, ending the day
   * before it starts. That is what the percent badges compare against, and it
   * is the only comparison that is fair: "this week against last week", not
   * "these four days against a whole month". `getRangeSummary` is one RPC, so
   * the comparison costs one more round trip and no new SQL.
   */
  const previous = previousRange(range);

  const [rows, summary, previousSummary, salesTrend, purchaseDays, expenseDays] = await Promise.all(
    [
      getStockRegister(range.from, range.to),
      getRangeSummary(range.from, range.to),
      getRangeSummary(previous.from, previous.to),
      getSalesTrend(range.from, range.to),
      getPurchaseTotalsByDay(range.from, range.to),
      getExpenseTotalsByDay(range.from, range.to),
    ],
  );

  // Grouped by tank, in the order the app shows fuels everywhere else (diesel
  // first - see FUEL_ORDER). The RPC already returns each tank's rows in date
  // order, which the cumulative columns depend on, so nothing is re-sorted
  // inside a group.
  const tanks = [];
  for (const row of rows) {
    let tank = tanks.find((candidate) => candidate.tank_id === row.tank_id);
    if (!tank) {
      tank = {
        tank_id: row.tank_id,
        name: row.tank_name,
        fuel_type: row.fuel_type,
        rows: [],
      };
      tanks.push(tank);
    }
    tank.rows.push(row);
  }
  tanks.sort(byFuelOrder);

  const traded = tanks.some((tank) =>
    tank.rows.some((row) => Number(row.meter_sales) > 0 || Number(row.receipts) > 0),
  );

  const profit = Number(summary.profit ?? 0);
  const costOfStockSold = Number(summary.cost_of_goods_sold ?? 0);
  const totalSales = Number(summary.total_sales ?? 0);
  const totalStockCost = Number(summary.total_stock_cost ?? 0);
  const expenses = Number(summary.expenses_total ?? 0);

  /*
   * ONE ROW PER DAY IN THE RANGE, INCLUDING THE EMPTY ONES. `salesTrend` fills
   * every day; deliveries and expenses do not happen daily, so their maps have
   * holes. Drawing straight from the map would give a four-point line labelled
   * as a month and quietly join the 3rd to the 19th as if nothing sat between
   * them. Days with nothing are zero, which is what actually happened.
   */
  const dayKeys = salesTrend.map((row) => row.day);
  // Both trades, because the headline Sales figure counts both - and because
  // the daily split below has to add up to the headline profit exactly.
  const seriesSales = salesTrend.map(
    (row) => Number(row.sale_amount ?? 0) + Number(row.lubricant_amount ?? 0),
  );
  const seriesStock = dayKeys.map((day) => Number(purchaseDays[day] ?? 0));
  const seriesExpenses = dayKeys.map((day) => Number(expenseDays[day] ?? 0));

  /*
   * THE DAILY PROFIT LINE SPREADS THE COST OF STOCK SOLD ACROSS THE DAYS BY
   * LITRES, and it used to subtract stock BOUGHT on the day instead.
   *
   * That was the same bug the headline had (migration 035), and left alone it
   * would now be worse than before: the tile above says one thing and the
   * shape under it says another. A delivery day would still plunge to a deep
   * loss on a line sitting beneath a profit figure that no longer counts
   * deliveries at all.
   *
   * Litres is the right key to spread on: the cost of a litre is roughly
   * constant across a short run of days, so a day that sold twice as much fuel
   * consumed twice as much stock. And the split is EXACT at the total - every
   * day's litres add up to the period's litres, so every day's cost adds up to
   * the period's cost of goods sold, and the daily profits add up to the
   * profit on the tile. Within the period it is an apportionment, not a
   * measurement, which is the right standing for a sparkline: a shape, not a
   * figure to read.
   */
  const seriesLitres = salesTrend.map((row) => Number(row.litres_sold ?? 0));
  const litresInPeriod = seriesLitres.reduce((sum, litres) => sum + litres, 0);
  const costPerLitre = litresInPeriod > 0 ? costOfStockSold / litresInPeriod : 0;
  const seriesProfit = dayKeys.map(
    (_, i) => seriesSales[i] - seriesLitres[i] * costPerLitre - seriesExpenses[i],
  );

  const tips = (series) =>
    dayKeys.map((day, i) => ({ v: formatPKR(series[i]), d: formatDate(day) }));

  const previousProfit = Number(previousSummary.profit ?? 0);
  const previousSales = Number(previousSummary.total_sales ?? 0);
  const previousStock = Number(previousSummary.total_stock_cost ?? 0);
  const previousExpenses = Number(previousSummary.expenses_total ?? 0);

  return (
    <>
      <PageHeader
        title="Sale & stock register"
        description="Petrol and diesel day by day, with the running sales and the running gain or loss."
      >
        <RegisterRange month={range.month} fromDay={range.fromDay} toDay={range.toDay} />
      </PageHeader>

      {/* The range in words, once and loudly. A page whose every figure depends
          on a chosen span must state that span where the eye lands first -
          the same rule as "the day on screen is stated once, and loudly". */}
      <h2 className="section-heading">
        {formatDate(range.from)} – {formatDate(range.to)}{' '}
        <span className="font-semibold text-ink-600">
          · {range.days} {range.days === 1 ? 'day' : 'days'}
        </span>
      </h2>

      {!traded ? (
        <EmptyState
          title="Nothing was traded on these days"
          description="No readings and no deliveries fall in this range. Try another month, or a wider run of days."
        />
      ) : (
        <>
          {/* ---- what each fuel did ---- */}
          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @[40rem]:grid-cols-2">
              {tanks.map((tank) => (
                <FuelCard key={tank.tank_id} fuelType={tank.fuel_type} rows={tank.rows} />
              ))}
            </div>
          </div>

          {/* ---- profit over the same days ---- */}
          <h2 className="section-heading">Profit over these days</h2>

          <div className="@container">
            <div className="grid grid-cols-1 gap-4 @[24rem]:grid-cols-2 @[50rem]:grid-cols-4">
              {/* `higherIsBetter` is FALSE on stock bought and expenses. An
                  up arrow on either is still an up arrow, but the pill goes
                  red: "expenses rose 40%" must never be painted the same green
                  as "sales rose 40%". See DeltaBadge.js. */}
              <MoneyTile
                label="Sales"
                value={formatPKR(totalSales)}
                spark={seriesSales}
                sparkTips={tips(seriesSales)}
                sparkTone="text-brand-600"
                delta={{
                  current: totalSales,
                  previous: previousSales,
                }}
              />
              <MoneyTile
                label="Stock bought"
                value={formatPKR(totalStockCost)}
                spark={seriesStock}
                sparkTips={tips(seriesStock)}
                delta={{
                  current: totalStockCost,
                  previous: previousStock,
                  higherIsBetter: false,
                }}
              />
              <MoneyTile
                label="Expenses"
                value={formatPKR(expenses)}
                spark={seriesExpenses}
                sparkTips={tips(seriesExpenses)}
                delta={{
                  current: expenses,
                  previous: previousExpenses,
                  higherIsBetter: false,
                }}
              />
              <MoneyTile
                label="Profit"
                value={formatPKR(profit)}
                tone={profit >= 0 ? 'positive' : 'negative'}
                spark={seriesProfit}
                sparkTips={tips(seriesProfit)}
                sparkTone={profit >= 0 ? 'text-brand-600' : 'text-red-600'}
                delta={{
                  current: profit,
                  previous: previousProfit,
                }}
              />
            </div>
          </div>

          {/* This used to warn that a single delivery could turn a good run of
              days into a loss here. It no longer can - profit counts the stock
              sold, so a delivery lands in closing stock rather than in the
              figure. What is worth saying instead is where the cost came from,
              because over a short run it is apportioned rather than measured. */}
          <p className="mt-3 text-sm text-ink-600">
            Profit counts the stock <span className="font-semibold">sold</span> over these days —
            a delivery still in the tank is not charged against them. The cost is spread across
            the days by litres sold, so each day&rsquo;s figure is a share rather than a
            measurement; the total is exact.
          </p>

          {/* ---- the register itself ---- */}
          {/* A Fragment, NOT a <section> per tank. `.section-heading` carries
              `first:mt-0` so that a heading opening a container has no gap
              above it - wrapped in a <section>, every one of these became its
              container's first child and lost the margin, leaving "Diesel
              tank" jammed against the paragraph above it. The grouping was
              decorative; the spacing is not. */}
          {tanks.map((tank) => (
            <Fragment key={tank.tank_id}>
              <h2 className="section-heading">
                <span className="inline-flex items-center gap-2">
                  <Chip
                    label={fuelColor(tank.fuel_type).label}
                    size="small"
                    className={fuelColor(tank.fuel_type).badge}
                    sx={{ fontWeight: 700 }}
                  />
                  {tank.name}
                </span>
              </h2>
              <RegisterTable rows={tank.rows} />
            </Fragment>
          ))}

          {/* The note names the columns exactly as the heading does - "Should
              be", "Dip", "Gain / loss" - so the reader can match a sentence to
              a column without translating. It said "Books" and "variance"
              while the table said something else, which is how a legend stops
              being read. */}
          <p className="mt-4 text-sm text-ink-600">
            <span className="font-semibold">Should be</span> is the opening stock plus what was
            delivered, less what the meters sold. <span className="font-semibold">Dip</span> is what
            the rod actually measured at the close of that day, and the{' '}
            <span className="font-semibold">gain / loss</span> is the difference between the two. A
            dip taken in the morning closes the day before — see the Stock page.
          </p>
        </>
      )}
    </>
  );
}
