import {
  requirePageRole,
  ROLES,
  todayISO,
  monthRange,
  formatMonth,
  formatDate,
  formatLitres,
  formatLitresFine,
  formatPKR,
} from '@/app/_lib/helpers';
import { getMonthlyReport, getSalesTrend } from '@/app/_lib/data-service';
import DailySalesTable from '@/app/_components/admin/DailySalesTable';
import Icon from '@/app/_components/ui/Icon';
import PageHeader from '@/app/_components/ui/PageHeader';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import SalesTrendChart from '@/app/_components/admin/SalesTrendChart';
import CashCreditChart from '@/app/_components/admin/CashCreditChart';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import PendingLink from '@/app/_components/ui/PendingLink';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const today = todayISO();

  // The month box posts back as YYYY-MM.
  const monthParam =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, month] = monthParam.split('-').map(Number);

  // Set by the export route when the download could not be produced. Trimmed,
  // because it goes on screen and arrives from the query string.
  const exportError =
    typeof params?.export_error === 'string' ? params.export_error.slice(0, 300) : null;

  // The charts and the day-by-day table follow the month box, like everything
  // else on this page. They used to show a rolling last-30-days window
  // regardless of the month chosen, so picking August still listed July's days
  // - and disagreed with the Excel download, which was always month-based.
  const { from: monthFrom, to: monthTo } = monthRange(year, month);

  const [report, trend] = await Promise.all([
    getMonthlyReport(year, month),
    getSalesTrend(monthFrom, monthTo),
  ]);

  const sales = report.sales ?? {};
  const purchases = report.purchases ?? {};
  const lubricantSales = report.lubricant_sales ?? {};
  const lubricantPurchases = report.lubricant_purchases ?? {};
  const lubricantsByProduct = report.lubricants_by_product ?? [];
  const profit = Number(report.profit ?? 0);

  // Fuel and lubricants, added up. The tiles report the business; the sections
  // under them are where each trade is shown on its own.
  const totalSales = Number(report.total_sales ?? 0);
  const totalStockCost = Number(report.total_stock_cost ?? 0);
  const totalCash = Number(sales.cash_amount ?? 0) + Number(lubricantSales.cash_amount ?? 0);
  const totalCredit = Number(sales.credit_amount ?? 0) + Number(lubricantSales.credit_amount ?? 0);
  const totalPending =
    Number(purchases.pending_amount ?? 0) + Number(lubricantPurchases.pending_amount ?? 0);
  const lubricantAmount = Number(lubricantSales.amount ?? 0);

  return (
    <>
      <PageHeader title="Reports" description="Performance, costs and profit.">
        <form method="GET" action="/admin/reports" className="flex items-center gap-2">
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <input
            id="month"
            type="month"
            name="month"
            defaultValue={monthParam}
            className="input py-2"
          />
          <button type="submit" className="btn-secondary">
            Show
          </button>
        </form>

        {/* A plain link, not a fetch: the browser handles the download itself,
            so it works the same on a phone as on a desktop.

            Deliberately NO `download` attribute. It forces the browser to save
            whatever the URL returns - including a redirect target - so a failed
            export landed in Downloads as a junk file instead of showing why.
            The route's Content-Disposition header downloads the workbook on
            its own, and lets a failure navigate back here normally. */}
        <a href={`/admin/reports/export?month=${monthParam}`} className="btn-primary">
          Download Excel
        </a>
      </PageHeader>

      {exportError ? (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          The Excel download did not work: {exportError}
        </p>
      ) : null}

      {/* ---- monthly headline ---- */}
      <h2 className="section-heading">
        {formatDate(report.from)} – {formatDate(report.to)}
      </h2>

      <StatGrid>
        <StatTile
          label="Sales"
          value={formatPKR(totalSales)}
          sub={
            lubricantAmount > 0
              ? `${formatPKR(sales.sale_amount)} fuel · ${formatPKR(lubricantAmount)} lubricants`
              : formatLitres(sales.litres_sold)
          }
        />
        <StatTile
          label="Stock bought"
          value={formatPKR(totalStockCost)}
          sub={
            Number(lubricantPurchases.total_cost ?? 0) > 0
              ? `${formatPKR(purchases.total_cost)} fuel · ${formatPKR(lubricantPurchases.total_cost)} lubricants`
              : formatLitres(purchases.quantity_litres)
          }
        />
        {/* The total only. Recording an expense, and the breakdown by
            category, moved to /admin/expenses - so the tile carries the link
            rather than leaving the figure with no way through to its detail. */}
        <StatTile
          label="Expenses"
          value={formatPKR(report.expenses_total)}
          sub={
            <PendingLink
              href={`/admin/expenses?month=${monthParam}`}
              className="inline-flex items-center gap-1.5 font-semibold text-brand-700 underline"
            >
              See or add expenses
            </PendingLink>
          }
        />
        <StatTile
          label="Profit"
          value={formatPKR(profit)}
          tone={profit >= 0 ? 'positive' : 'negative'}
          sub="sales − stock bought − expenses"
        />
      </StatGrid>

      <p className="mt-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-600">
        Sales and profit here cover both trades — fuel through the nozzles and lubricants over the
        counter. Profit counts stock <span className="font-semibold">bought</span> this month, not
        stock sold from the tank or the shelf. A big delivery near month end therefore makes profit
        look low — that money is sitting in stock, which is what the closing figures below show.
      </p>

      {/* ---- cash / credit + pending ---- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="figure-label">Cash taken</p>
          <p className="tabular mt-1 text-xl font-bold text-ink-900">{formatPKR(totalCash)}</p>
        </div>
        <div className="card p-4">
          <p className="figure-label">Given on credit</p>
          <p className="tabular mt-1 text-xl font-bold text-ink-900">{formatPKR(totalCredit)}</p>
        </div>
        <div className="card p-4">
          <p className="figure-label">
            Owed to suppliers
          </p>
          <p
            className={`tabular mt-1 text-xl font-bold ${
              totalPending > 0 ? 'text-red-700' : 'text-ink-900'
            }`}
          >
            {formatPKR(totalPending)}
          </p>
        </div>
      </div>

      {/* ---- lubricants ---- */}
      <h2 className="section-heading">
        Lubricants
      </h2>

      {lubricantsByProduct.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-ink-500">
          No lubricants were bought or sold in this month.
        </p>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <div className="card p-4">
              <p className="figure-label">Sold</p>
              <p className="tabular mt-1 text-xl font-bold text-ink-900">
                {formatPKR(lubricantAmount)}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {formatLitres(lubricantSales.litres)} over{' '}
                {Number(lubricantSales.sales_count ?? 0)} sales
              </p>
              {/* The drum called out on its own line. It is a large share of
                  the SALE COUNT and a small share of the money, so folded into
                  one figure it makes both look wrong. */}
              {Number(lubricantSales.loose_count ?? 0) > 0 ? (
                <p className="mt-0.5 text-sm text-ink-600">
                  of which loose oil:{' '}
                  <span className="font-semibold text-ink-800">
                    {formatPKR(lubricantSales.loose_amount)}
                  </span>{' '}
                  over {Number(lubricantSales.loose_count)} sales
                </p>
              ) : null}
            </div>
            <div className="card p-4">
              <p className="figure-label">Cash</p>
              <p className="tabular mt-1 text-xl font-bold text-ink-900">
                {formatPKR(lubricantSales.cash_amount)}
              </p>
            </div>
            <div className="card p-4">
              <p className="figure-label">On credit</p>
              <p className="tabular mt-1 text-xl font-bold text-ink-900">
                {formatPKR(lubricantSales.credit_amount)}
              </p>
            </div>
            <div className="card p-4">
              <p className="figure-label">
                Stock bought
              </p>
              <p className="tabular mt-1 text-xl font-bold text-ink-900">
                {formatPKR(lubricantPurchases.total_cost)}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {formatLitres(lubricantPurchases.quantity_litres)}
              </p>
            </div>
          </div>

          <div className="card table-scroll">
            <table className="w-full min-w-[44rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Lubricant</th>
                  <th className="th text-right">Litres sold</th>
                  <th className="th text-right">Sales</th>
                  <th className="th text-right">Cash</th>
                  <th className="th text-right">Credit</th>
                  <th className="th text-right">Restocked</th>
                  <th className="th text-right">Left at month end</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {lubricantsByProduct.map((product) => (
                  <tr key={product.lubricant_id}>
                    <td className="td font-medium">
                      {product.name}
                      {product.sold_loose ? (
                        <span className="badge ml-2 bg-amber-100 text-amber-900">loose</span>
                      ) : null}
                    </td>
                    <td className="td-num">
                      {product.sold_loose
                        ? formatLitresFine(product.litres_sold)
                        : formatLitres(product.litres_sold)}
                    </td>
                    <td className="td-num font-semibold">{formatPKR(product.amount)}</td>
                    <td className="td-num">{formatPKR(product.cash_amount)}</td>
                    <td className="td-num">{formatPKR(product.credit_amount)}</td>
                    <td className="td-num text-ink-600">
                      {Number(product.bought_litres) > 0
                        ? `${formatLitres(product.bought_litres)} · ${formatPKR(product.bought_cost)}`
                        : '—'}
                    </td>
                    <td className="td-num font-semibold">
                      {product.sold_loose
                        ? formatLitresFine(product.closing_litres)
                        : formatLitres(product.closing_litres)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- closing stock ---- */}
      <h2 className="section-heading">
        Closing stock at month end
      </h2>
      <div className="card table-scroll">
        <table className="w-full min-w-[32rem]">
          <thead className="border-b border-ink-200 bg-ink-50">
            <tr>
              <th className="th">Tank</th>
              <th className="th">Fuel</th>
              <th className="th text-right">Closing litres</th>
              <th className="th text-right">Gain / loss in month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(report.closing_inventory ?? []).map((tank) => {
              const gainLoss = (report.stock_gain_loss ?? []).find(
                (row) => row.tank_id === tank.tank_id,
              );
              const difference = gainLoss ? Number(gainLoss.gain_loss) : null;

              return (
                <tr key={tank.tank_id}>
                  <td className="td font-medium">{tank.name}</td>
                  <td className="td">
                    <FuelBadge fuelType={tank.fuel_type} />
                  </td>
                  <td className="td-num font-semibold">{formatLitres(tank.closing_litres)}</td>
                  <td
                    className={[
                      'td-num font-bold',
                      difference === null || difference === 0
                        ? 'text-ink-500'
                        : difference > 0
                          ? 'text-brand-700'
                          : 'text-red-700',
                    ].join(' ')}
                  >
                    {difference === null
                      ? '—'
                      : `${difference > 0 ? '+' : ''}${formatLitres(difference)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- 30 day trend ---- */}
      <h2 className="section-heading">
        {formatMonth(year, month)} day by day
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Daily fuel sales</h3>
          <SalesTrendChart data={trend} height={280} />
        </section>
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Fuel: cash vs credit</h3>
          <CashCreditChart data={trend} height={280} />
        </section>
      </div>

      {/* The same days as numbers - for anyone who cannot read the charts, and
          for checking a specific day without hovering. Still collapsed by
          default and still scoped to the month on screen; the link goes to the
          same table paged back over every day the pump has traded. */}
      <details className="card mt-4 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">
          Show these days as a table
        </summary>

        <div className="mt-4">
          <DailySalesTable rows={trend} />
        </div>

        <PendingLink
          href="/admin/reports/daily"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          See every day, not just this month
          <Icon name="chevronRight" className="h-4 w-4" />
        </PendingLink>
      </details>

    </>
  );
}
