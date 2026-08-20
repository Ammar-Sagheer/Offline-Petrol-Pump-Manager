import Link from 'next/link';

import {
  requirePageRole,
  ROLES,
  todayISO,
  shiftISODate,
  formatDate,
  formatLitres,
  formatPKR,
} from '@/app/_lib/helpers';
import { getDailySummary, getSalesTrend, getLubricantTrend } from '@/app/_lib/data-service';
import { fuelColor, byFuelOrder } from '@/app/_lib/fuel-colors';
import PageHeader from '@/app/_components/ui/PageHeader';
import DateNav from '@/app/_components/admin/DateNav';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import SalesTrendChart from '@/app/_components/admin/SalesTrendChart';
import CashCreditChart from '@/app/_components/admin/CashCreditChart';
import LubricantTrendChart from '@/app/_components/admin/LubricantTrendChart';
import TrendRange, { trendDaysFrom } from '@/app/_components/admin/TrendRange';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  /* The charts end on the day the rest of the dashboard is showing; this is
     only how far back they reach. Both controls write to the query string, so
     each one has to carry the other's value forward or picking a window would
     silently throw the reader back to today. */
  const trendDays = trendDaysFrom(params);
  const trendFrom = shiftISODate(date, -(trendDays - 1));

  const [summary, trend, lubricantTrend] = await Promise.all([
    getDailySummary(date),
    getSalesTrend(trendFrom, date),
    getLubricantTrend(trendFrom, date),
  ]);

  const totals = summary.totals ?? {};
  const byFuel = summary.by_fuel_type ?? [];
  const tanks = summary.tanks ?? [];
  const purchases = summary.purchases ?? {};
  const lubricants = summary.lubricants ?? {};
  const lubricantsSold = summary.lubricants_by_product ?? [];
  const lubricantStock = summary.lubricant_stock ?? [];
  const lubColor = fuelColor('lubricant');

  // The tiles at the top are the whole day's takings, fuel and oil together -
  // that is what was in the drawer at closing time. The sections below are
  // where each trade is broken out.
  const fuelAmount = Number(totals.sale_amount ?? 0);
  const lubricantAmount = Number(lubricants.amount ?? 0);
  const saleAmount = fuelAmount + lubricantAmount;
  const cashAmount = Number(totals.cash_amount ?? 0) + Number(lubricants.cash_amount ?? 0);
  const creditAmount = Number(totals.credit_amount ?? 0) + Number(lubricants.credit_amount ?? 0);
  const creditShare = saleAmount > 0 ? Math.round((creditAmount / saleAmount) * 100) : 0;

  /*
   * YESTERDAY, FOR THE PERCENT BADGES - and only on the two tiles where the
   * comparison is EXACT.
   *
   * `trend` is fuel; `lubricantTrend` is oil, split packed and loose. Added
   * together they reconstruct "Fuel sold" and "Total sales" for any day in the
   * window exactly as this page computes them for the day on screen, so those
   * two can be compared against the day before with nothing fudged.
   *
   * Cash and On credit shipped WITHOUT badges for one round, because
   * `lubricantTrend` carried only amounts and their tiles are fuel cash plus
   * OIL cash - the comparison would have had to drop the oil half or pretend
   * it was all cash, wrong by an amount the reader could not see. Migration
   * 043 added the per-day split, so all four are exact now and none of them is
   * an estimate.
   */
  const previousDay = shiftISODate(date, -1);
  const previousFuel = trend.find((row) => row.day === previousDay);
  const previousLub = lubricantTrend.find((row) => row.day === previousDay);

  const previousLitres = previousFuel
    ? Number(previousFuel.petrol_litres ?? 0) + Number(previousFuel.diesel_litres ?? 0)
    : null;

  const previousSales = previousFuel
    ? Number(previousFuel.sale_amount ?? 0) +
      Number(previousLub?.pack_amount ?? 0) +
      Number(previousLub?.loose_amount ?? 0)
    : null;

  const previousCash = previousFuel
    ? Number(previousFuel.cash_amount ?? 0) + Number(previousLub?.cash_amount ?? 0)
    : null;

  const previousCredit = previousFuel
    ? Number(previousFuel.credit_amount ?? 0) + Number(previousLub?.credit_amount ?? 0)
    : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="The day's takings, stock and trend. The day shown is below."
      />

      {/* Own row, as on Readings and Lubricants - see docs/UI_CONVENTIONS.md.
          With the sidebar taking 240px this header has less width to play with
          than it used to, which is exactly when the group starts wrapping
          against the title on the days "Back to today" appears. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <DateNav
          date={date}
          basePath="/admin"
          previousDate={shiftISODate(date, -1)}
          nextDate={shiftISODate(date, 1)}
          extraParams={{ days: trendDays }}
        />
      </div>

      {/* `tips` is formatted HERE, on the server, because Sparkline is a
          client component and a formatter cannot cross that boundary - and
          because formatPKR/formatLitres are the app's single answer to how a
          number is written. Re-implementing either inside the chart is how a
          tooltip and a table start disagreeing about a figure. */}
      {/* The sparklines are the SAME SERIES the charts further down already
          draw, over the same window - `trend` is fetched once and read twice.
          No extra query, and no risk of the little line and the big chart
          disagreeing about a day, which is what would happen if the tile
          fetched its own. They are decoration with a shape: unlabelled, no
          axis, aria-hidden, and never the only place a figure appears. */}
      <StatGrid>
        <StatTile
          icon="fuelPump"
          label="Fuel sold"
          value={formatLitres(totals.litres_sold)}
          spark={trend.map(
            (row) => Number(row.petrol_litres ?? 0) + Number(row.diesel_litres ?? 0),
          )}
          sparkTips={trend.map((row) => ({
            v: formatLitres(Number(row.petrol_litres ?? 0) + Number(row.diesel_litres ?? 0)),
            d: formatDate(row.day),
          }))}
          delta={
            previousLitres === null
              ? null
              : {
                  current: Number(totals.litres_sold ?? 0),
                  previous: previousLitres,
                }
          }
          /* A TILE WITH NOTHING TO ADD SAYS SO. On a day with no readings the
             four tiles were "Rs 0" over an inch of white, which reads as a
             page that failed to load rather than a day that has not been
             entered yet. The message is the same length as the figure it
             replaces, so the row keeps its height either way. */
          sub={
            Number(lubricants.litres ?? 0) > 0
              ? `plus ${formatLitres(lubricants.litres)} of lubricants`
              : Number(totals.litres_sold ?? 0) > 0
                ? 'no lubricants sold'
                : 'No readings entered for this day'
          }
        />
        <StatTile
          icon="sales"
          label="Total sales"
          value={formatPKR(saleAmount)}
          spark={trend.map((row) => Number(row.sale_amount ?? 0))}
          sparkTips={trend.map((row) => ({
            v: formatPKR(row.sale_amount),
            d: formatDate(row.day),
          }))}
          delta={
            previousSales === null
              ? null
              : {
                  current: saleAmount,
                  previous: previousSales,
                }
          }
          sub={
            lubricantAmount > 0
              ? `${formatPKR(fuelAmount)} fuel · ${formatPKR(lubricantAmount)} lubricants`
              : saleAmount > 0
                ? 'fuel only — no oil sold'
                : 'Nothing sold on this day'
          }
        />
        <StatTile
          icon="cash"
          label="Cash"
          value={formatPKR(cashAmount)}
          spark={trend.map((row) => Number(row.cash_amount ?? 0))}
          sparkTips={trend.map((row) => ({
            v: formatPKR(row.cash_amount),
            d: formatDate(row.day),
          }))}
          delta={previousCash === null ? null : { current: cashAmount, previous: previousCash }}
          sub={saleAmount > 0 ? `${100 - creditShare}% of takings` : 'Nothing taken in cash'}
        />
        <StatTile
          icon="credit"
          label="On credit"
          value={formatPKR(creditAmount)}
          spark={trend.map((row) => Number(row.credit_amount ?? 0))}
          sparkTips={trend.map((row) => ({
            v: formatPKR(row.credit_amount),
            d: formatDate(row.day),
          }))}
          delta={
            previousCredit === null
              ? null
              : { current: creditAmount, previous: previousCredit, higherIsBetter: false }
          }
          sub={saleAmount > 0 ? `${creditShare}% of takings` : 'Nothing sold on credit'}
          tone={creditShare > 50 ? 'negative' : 'default'}
        />
      </StatGrid>

      {/* ---- by fuel type ---- */}
      <h2 className="section-heading">By fuel type</h2>
      {byFuel.length === 0 ? (
        <p className="card px-4 py-6 text-center text-base text-ink-600">
          Nothing entered for this day yet.{' '}
          <Link
            href={`/admin/readings?date=${date}`}
            className="font-semibold text-brand-700 hover:underline"
          >
            Enter readings
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...byFuel].sort(byFuelOrder).map((fuel) => {
            const color = fuelColor(fuel.fuel_type);
            return (
              <div key={fuel.fuel_type} className={`card border-t-4 p-4 ${color.accent}`}>
                {/* An accent rule, not a filled band: the fuels are only being
                    READ here. See fuel-colors.js on why the loud treatment is
                    rationed to the Stock page, where typing into the wrong card
                    corrupts every later day's figures.

                    The accent rule and the heading text both have to use the
                    DARK relative of the fuel's hue to stay legible - diesel's
                    raw #FDBA74 as text is unreadable, and as a hairline it all
                    but disappears on white. So neither one is actually showing
                    diesel's colour, which is what the owner noticed. The dot
                    beside the heading is: a filled swatch has no text sitting
                    on it to protect, so it is free to be the real hue, with a
                    hairline ring so a very pale one (diesel, lubricant) still
                    has a visible edge against a white card. */}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
                      style={{ backgroundColor: color.raw }}
                      aria-hidden="true"
                    />
                    <h3 className={`text-base font-bold ${color.onWhite}`}>{color.label}</h3>
                  </div>
                  <span className="tabular whitespace-nowrap text-lg font-bold text-ink-900">
                    {formatLitres(fuel.litres_sold)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-200/60 pt-3">
                  <div>
                    <dt className="figure-label">Sales</dt>
                    <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                      {formatPKR(fuel.sale_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="figure-label">Cash</dt>
                    <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                      {formatPKR(fuel.cash_amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="figure-label">Credit</dt>
                    <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                      {formatPKR(fuel.credit_amount)}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- tanks ---- */}
      <h2 className="section-heading">Tank stock</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[...tanks].sort(byFuelOrder).map((tank) => {
          /*
           * The books AT THE CLOSE OF THE DAY ON SCREEN, not the tank's cached
           * "right now" figure.
           *
           * `current_stock_litres` is a single cached number meaning today, so
           * stepping back through the dates left every past day showing today's
           * stock - the tanks were the one block on this page that ignored the
           * date banner above them. `get_daily_summary` has always returned a
           * per-date `expected_stock` beside it; the card was reading the wrong
           * one of the two.
           */
          const stock = Number(tank.expected_stock ?? tank.current_stock_litres ?? 0);
          const capacity = Number(tank.capacity_litres ?? 0);
          const fill = capacity > 0 ? Math.min(100, Math.max(0, (stock / capacity) * 100)) : 0;
          const gainLoss = tank.gain_loss === null ? null : Number(tank.gain_loss);

          const color = fuelColor(tank.fuel_type);

          return (
            <div key={tank.id} className={`card border-t-4 p-4 ${color.accent}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  {/* Same true-hue swatch as the fuel-type cards above - see the
                      comment there. */}
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
                    style={{ backgroundColor: color.raw }}
                    aria-hidden="true"
                  />
                  <h3 className={`text-base font-bold ${color.onWhite}`}>{tank.name}</h3>
                </div>
                <span
                  className={`tabular whitespace-nowrap text-lg font-bold ${
                    stock < 0 ? 'text-red-700' : 'text-ink-900'
                  }`}
                >
                  {formatLitres(stock)}
                </span>
              </div>

              <div>
                {/* Say WHICH MOMENT this figure is, in the same words the Stock
                  page uses. It is an end-of-day number - the day's sales already
                  taken off and its deliveries already added on - and nothing on
                  this card said so, which is a fair thing to have to ask about a
                  tank level sitting under a list of that day's sales. */}
                <p className="text-sm text-ink-600">at the close of {formatDate(date)}</p>

                {/* Book stock below zero means more fuel has been sold than ever
                  went into the tank - so a delivery is missing, or an opening
                  stock was never set. Worth shouting about rather than showing
                  as an ordinary number. */}
                {stock < 0 ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                    Stock has gone below zero. A delivery is probably missing, or this tank’s
                    opening stock was never set under Settings.
                  </p>
                ) : null}
                <div
                  className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-200"
                  role="img"
                  aria-label={`${tank.name} is about ${Math.round(fill)} percent full`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${fill}%`,
                      backgroundColor: color.hex,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-sm text-ink-600">
                  {Math.round(fill)}% of {formatLitres(capacity)} capacity
                </p>

                {gainLoss === null ? (
                  <p className="mt-3 border-t border-ink-200 pt-3 text-sm text-ink-600">
                    No dip has closed this day yet.{' '}
                    {/* The dip that closes this day is the one taken the NEXT
                      morning, so that is the Stock page to open. */}
                    <Link
                      href={`/admin/stock-checks?date=${shiftISODate(date, 1)}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      Record one
                    </Link>
                  </p>
                ) : (
                  <p
                    className={[
                      'tabular mt-3 border-t border-ink-200 pt-3 text-sm font-semibold',
                      gainLoss === 0
                        ? 'text-ink-600'
                        : gainLoss > 0
                          ? 'text-brand-700'
                          : 'text-red-700',
                    ].join(' ')}
                  >
                    {gainLoss === 0
                      ? 'Dip matches the books exactly'
                      : gainLoss > 0
                        ? `Gain of ${formatLitres(gainLoss)} against the books`
                        : `Loss of ${formatLitres(Math.abs(gainLoss))} against the books`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {Number(purchases.quantity_litres ?? 0) > 0 ? (
        <p className="mt-4 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
          <span className="tabular font-semibold">{formatLitres(purchases.quantity_litres)}</span>{' '}
          delivered on this date, costing{' '}
          <span className="tabular font-semibold">{formatPKR(purchases.total_cost)}</span>.
        </p>
      ) : null}

      {/* ---- lubricants ---- */}
      <h2 className="section-heading">Lubricants</h2>

      {lubricantStock.length === 0 ? (
        <p className="card px-4 py-6 text-center text-base text-ink-600">
          No lubricants set up yet.{' '}
          <Link href="/admin/lubricants" className="font-semibold text-brand-700 hover:underline">
            Add the ones the pump stocks
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Lubricants wear violet here for the same reason the tanks wear
              navy and yellow: it is the colour this product already has on its
              badge, from app/_lib/fuel-colors.js. Semantic, not decoration -
              which is also why the strip of takings above stays uncoloured. */}
          <div className={`card border-t-4 p-4 ${lubColor.accent}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className={`text-base font-bold ${lubColor.onWhite}`}>Sold on this day</h3>
              <span className="tabular whitespace-nowrap text-lg font-bold text-ink-900">
                {formatPKR(lubricants.amount)}
              </span>
            </div>
            <div className="mt-3 border-t border-ink-200/60 pt-3">
              {Number(lubricants.sales_count ?? 0) === 0 ? (
                <p className="text-sm text-ink-600">
                  Nothing sold over the counter on this date.{' '}
                  <Link
                    href={`/admin/lubricants?date=${date}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    Record a sale
                  </Link>
                </p>
              ) : (
                <>
                  <dl className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="figure-label">Litres</dt>
                      <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                        {formatLitres(lubricants.litres)}
                      </dd>
                    </div>
                    <div>
                      <dt className="figure-label">Cash</dt>
                      <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                        {formatPKR(lubricants.cash_amount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="figure-label">Credit</dt>
                      <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                        {formatPKR(lubricants.credit_amount)}
                      </dd>
                    </div>
                  </dl>

                  <ul className="mt-3 space-y-2 border-t border-ink-200/60 pt-3 text-sm">
                    {lubricantsSold.map((product) => (
                      <li key={product.name} className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-ink-800">{product.name}</span>
                        <span className="tabular shrink-0 font-semibold text-ink-900">
                          {formatLitres(product.litres)} · {formatPKR(product.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* The shelf, so a product about to run out is noticed from the
              dashboard rather than when a customer asks for it. */}
          <div className={`card border-t-4 p-4 ${lubColor.accent}`}>
            <h3 className={`text-base font-bold ${lubColor.onWhite}`}>On the shelf</h3>
            <ul className="mt-3 space-y-2 border-t border-ink-200/60 pt-3 text-sm">
              {lubricantStock.map((product) => {
                const left = Number(product.stock_litres ?? 0);
                return (
                  <li key={product.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-ink-800">{product.name}</span>
                    <span
                      className={[
                        'tabular shrink-0 font-semibold',
                        left <= 0 ? 'text-red-700' : 'text-ink-900',
                      ].join(' ')}
                    >
                      {formatLitres(left)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ---- trends ---- */}
      {/* The heading and the control share a line, and the heading states the
          span in full underneath. "Last 30 days" alone is ambiguous the moment
          the reader has stepped back a week with the arrows above - these
          charts end on the day the page is showing, not on today. */}
      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-heading mb-0 mt-0">Last {trendDays} days</h2>
          <p className="mt-1 text-sm text-ink-600">
            {formatDate(trendFrom)} to {formatDate(date)}
          </p>
        </div>

        <TrendRange days={trendDays} hrefFor={(window) => `/admin?date=${date}&days=${window}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink-900">Daily fuel sales</h3>
          <SalesTrendChart data={trend} />
        </section>
        <section className="card p-4">
          <h3 className="mb-3 text-base font-bold text-ink-900">Fuel: cash vs credit</h3>
          <CashCreditChart data={trend} />
        </section>
        {/* The oil side gets the full width of the row rather than a third
            column. Its two series stack into one bar per day, and squeezed to a
            third of the page the quiet days become slivers - which is exactly
            where the drum's takings live. */}
        <section className="card p-4 lg:col-span-2">
          <h3 className="mb-3 text-base font-bold text-ink-900">Oil sales — packed and loose</h3>
          <LubricantTrendChart data={lubricantTrend} />
        </section>
      </div>
    </>
  );
}
