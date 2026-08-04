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
import { getDailySummary, getSalesTrend } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import DateNav from '@/app/_components/admin/DateNav';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import SalesTrendChart from '@/app/_components/admin/SalesTrendChart';
import CashCreditChart from '@/app/_components/admin/CashCreditChart';

export const metadata = { title: 'Dashboard' };

const TREND_DAYS = 14;

export default async function DashboardPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  const [summary, trend] = await Promise.all([
    getDailySummary(date),
    getSalesTrend(shiftISODate(date, -(TREND_DAYS - 1)), date),
  ]);

  const totals = summary.totals ?? {};
  const byFuel = summary.by_fuel_type ?? [];
  const tanks = summary.tanks ?? [];
  const purchases = summary.purchases ?? {};

  const saleAmount = Number(totals.sale_amount ?? 0);
  const cashAmount = Number(totals.cash_amount ?? 0);
  const creditAmount = Number(totals.credit_amount ?? 0);
  const creditShare = saleAmount > 0 ? Math.round((creditAmount / saleAmount) * 100) : 0;

  return (
    <>
      <PageHeader title="Dashboard" description={formatDate(date)}>
        <DateNav
          date={date}
          basePath="/admin"
          previousDate={shiftISODate(date, -1)}
          nextDate={shiftISODate(date, 1)}
        />
      </PageHeader>

      <StatGrid>
        <StatTile label="Litres sold" value={formatLitres(totals.litres_sold)} />
        <StatTile label="Total sales" value={formatPKR(saleAmount)} />
        <StatTile
          label="Cash"
          value={formatPKR(cashAmount)}
          sub={saleAmount > 0 ? `${100 - creditShare}% of takings` : null}
        />
        <StatTile
          label="On credit"
          value={formatPKR(creditAmount)}
          sub={saleAmount > 0 ? `${creditShare}% of takings` : null}
          tone={creditShare > 50 ? 'negative' : 'default'}
        />
      </StatGrid>

      {/* ---- by fuel type ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
        By fuel type
      </h2>
      {byFuel.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-ink-500">
          Nothing entered for this day yet.{' '}
          <Link href={`/admin/readings?date=${date}`} className="font-semibold text-brand-700 hover:underline">
            Enter readings
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {byFuel.map((fuel) => (
            <div
              key={fuel.fuel_type}
              className={`card p-4 ${fuel.fuel_type === 'petrol' ? 'bg-sky-50' : 'bg-amber-50'}`}
            >
              <div className="flex items-baseline justify-between">
                <h3
                  className={`text-sm font-bold ${
                    fuel.fuel_type === 'petrol' ? 'text-sky-900' : 'text-amber-900'
                  }`}
                >
                  {fuel.fuel_type === 'petrol' ? 'Petrol' : 'Diesel'}
                </h3>
                <span className="tabular text-lg font-bold text-ink-900">
                  {formatLitres(fuel.litres_sold)}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-200/60 pt-3 text-xs">
                <div>
                  <dt className="text-ink-500">Sales</dt>
                  <dd className="tabular font-semibold text-ink-900">
                    {formatPKR(fuel.sale_amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Cash</dt>
                  <dd className="tabular font-semibold text-ink-900">
                    {formatPKR(fuel.cash_amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Credit</dt>
                  <dd className="tabular font-semibold text-ink-900">
                    {formatPKR(fuel.credit_amount)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {/* ---- tanks ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
        Tank stock
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tanks.map((tank) => {
          const stock = Number(tank.current_stock_litres ?? 0);
          const capacity = Number(tank.capacity_litres ?? 0);
          const fill = capacity > 0 ? Math.min(100, Math.max(0, (stock / capacity) * 100)) : 0;
          const gainLoss = tank.gain_loss === null ? null : Number(tank.gain_loss);

          return (
            <div key={tank.id} className="card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-ink-900">{tank.name}</h3>
                <span
                  className={`tabular text-lg font-bold ${
                    stock < 0 ? 'text-red-700' : 'text-ink-900'
                  }`}
                >
                  {formatLitres(stock)}
                </span>
              </div>

              {/* Book stock below zero means more fuel has been sold than ever
                  went into the tank - so a delivery is missing, or an opening
                  stock was never set. Worth shouting about rather than showing
                  as an ordinary number. */}
              {stock < 0 ? (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                  Stock has gone below zero. A delivery is probably missing, or this tank’s opening
                  stock was never set under Settings.
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
                    backgroundColor: tank.fuel_type === 'petrol' ? '#0284c7' : '#ca8a04',
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-500">
                {Math.round(fill)}% of {formatLitres(capacity)} capacity
              </p>

              {gainLoss === null ? (
                <p className="mt-3 border-t border-ink-200 pt-3 text-xs text-ink-500">
                  No dip recorded for this date.{' '}
                  <Link
                    href={`/admin/stock-checks?date=${date}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    Record one
                  </Link>
                </p>
              ) : (
                <p
                  className={[
                    'tabular mt-3 border-t border-ink-200 pt-3 text-xs font-semibold',
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
          );
        })}
      </div>

      {Number(purchases.quantity_litres ?? 0) > 0 ? (
        <p className="mt-4 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
          <span className="tabular font-semibold">
            {formatLitres(purchases.quantity_litres)}
          </span>{' '}
          delivered on this date, costing{' '}
          <span className="tabular font-semibold">{formatPKR(purchases.total_cost)}</span>.
        </p>
      ) : null}

      {/* ---- trends ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
        Last {TREND_DAYS} days
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Daily sales</h3>
          <SalesTrendChart data={trend} />
        </section>
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Cash vs credit</h3>
          <CashCreditChart data={trend} />
        </section>
      </div>
    </>
  );
}
