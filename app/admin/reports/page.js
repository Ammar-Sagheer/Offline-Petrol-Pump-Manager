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
import Button from '@/app/_components/ui/Button';
import DownloadNotice from '@/app/_components/ui/DownloadNotice';
import DailyTableDialog from '@/app/_components/admin/DailyTableDialog';

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

  /*
   * The three figures profit is now actually made of (migration 035). Profit
   * subtracts the cost of stock SOLD, which is opening stock + what was bought
   * - closing stock, so a delivery that is still in the tank on the last of the
   * month is no longer charged against the month that bought it.
   */
  const costOfStockSold = Number(report.cost_of_goods_sold ?? 0);
  const openingStock = Number(report.opening_stock_value ?? 0);
  const closingStock = Number(report.closing_stock_value ?? 0);
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
          <Button variant="secondary" type="submit">
            Show
          </Button>
        </form>

        {/* A plain link, not a fetch: the browser handles the download itself,
            so it works the same on a phone as on a desktop.

            Deliberately NO `download` attribute. It forces the browser to save
            whatever the URL returns - including a redirect target - so a failed
            export landed in Downloads as a junk file instead of showing why.
            The route's Content-Disposition header downloads the workbook on
            its own, and lets a failure navigate back here normally. */}
        {/* The month box beside it is this page's; the register takes a run of
            days within a month, so it carries the month across and picks its
            own days from there. */}
        <Button variant="secondary" href={`/admin/reports/register?month=${monthParam}`} pending>
          Sale &amp; stock register
        </Button>

        <Button component="a" variant="primary" href={`/admin/reports/export?month=${monthParam}`}>
          Download Excel
        </Button>
      </PageHeader>

      {/* Self-clearing: a download that works does not re-render the page, so
          a reason left in the query string outlives the problem - this one
          takes itself out of the URL once it has been read. */}
      {exportError ? (
        <DownloadNotice param="export_error">
          The Excel download did not work: {exportError}
        </DownloadNotice>
      ) : null}

      {/* ---- monthly headline ---- */}
      <h2 className="section-heading">
        {formatDate(report.from)} – {formatDate(report.to)}
      </h2>

      <StatGrid>
        <StatTile
          icon="sales"
          label="Sales"
          value={formatPKR(totalSales)}
          sub={
            lubricantAmount > 0
              ? `${formatPKR(sales.sale_amount)} fuel · ${formatPKR(lubricantAmount)} lubricants`
              : formatLitres(sales.litres_sold)
          }
        />
        <StatTile
          icon="purchases"
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
          icon="expenses"
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
          icon="profit"
          label="Profit"
          value={formatPKR(profit)}
          tone={profit >= 0 ? 'positive' : 'negative'}
          sub="sales − cost of stock sold − expenses"
        />
      </StatGrid>

      {/* THE WORKING, NOT A WARNING. This line used to apologise for the
          figure - "profit counts stock bought this month, not stock sold, so a
          big delivery near month end makes it look low" - which was honest
          about a formula that was wrong. Migration 035 fixed the formula, so
          what belongs here is how the number was reached.

          It is a sentence rather than four more tiles because it is read once,
          when someone asks "how did it get to that?", and never again. The
          figures are in it so the arithmetic can be followed across without
          hunting for them, and the stock values are the two the owner cannot
          see anywhere else on the page. */}
      <p className="mt-3 text-sm leading-relaxed text-ink-600">
        {/* EVERY FIGURE IS whitespace-nowrap, and every gap around one is an
            explicit {' '}. Neither is decoration: money breaking across a line
            (a "Rs" ending one line, the number starting the next) reads as two
            figures, and JSX can silently drop a plain-whitespace gap next to an
            element in a way {' '} cannot. */}
        Profit counts the stock actually <span className="font-semibold">sold</span>:{' '}
        <span className="whitespace-nowrap">{formatPKR(openingStock)}</span>{' '}
        in the tanks at the start, plus{' '}
        <span className="whitespace-nowrap">{formatPKR(totalStockCost)}</span>{' '}
        bought, less{' '}
        <span className="whitespace-nowrap">{formatPKR(closingStock)}</span>{' '}
        still there at the end &mdash;{' '}
        <span className="whitespace-nowrap font-semibold text-ink-800">
          {formatPKR(costOfStockSold)}
        </span>
        . A delivery sitting in the tank on the last of the month is not charged against it.
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
      {/* The heading and the way out of the charts, on one line. The days as
          numbers used to be a <details> block UNDER the charts, which put the
          alternative to a chart below the chart it was an alternative to - so
          anyone the chart was failing had to scroll past it to find the table.
          Here the choice is where the reader already is. */}
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">{formatMonth(year, month)} day by day</h2>

        <DailyTableDialog
          label="Show these days as a table"
          title={`${formatMonth(year, month)} day by day`}
          subtitle={
            <span className="text-sm text-ink-600">
              {formatDate(report.from)} – {formatDate(report.to)}
            </span>
          }
        >
          {/* Rendered on the server and handed to the dialog as children -
              DailySalesTable formats through helpers.js, which cannot cross
              into a client bundle. */}
          <DailySalesTable rows={trend} />

          <PendingLink
            href="/admin/reports/daily"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
          >
            See every day, not just this month
            <Icon name="chevronRight" className="h-4 w-4" />
          </PendingLink>
        </DailyTableDialog>
      </div>

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

    </>
  );
}
