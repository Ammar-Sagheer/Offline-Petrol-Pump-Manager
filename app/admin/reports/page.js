import {
  requirePageRole,
  ROLES,
  todayISO,
  monthRange,
  formatMonth,
  formatDate,
  formatLitres,
  formatPKR,
} from '@/app/_lib/helpers';
import { getMonthlyReport, getSalesTrend, getExpenses } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import SalesTrendChart from '@/app/_components/admin/SalesTrendChart';
import CashCreditChart from '@/app/_components/admin/CashCreditChart';
import ExpenseForm from '@/app/_components/admin/ExpenseForm';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import DeleteExpenseButton from '@/app/_components/admin/DeleteExpenseButton';

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

  const [report, trend, expenses] = await Promise.all([
    getMonthlyReport(year, month),
    getSalesTrend(monthFrom, monthTo),
    getExpenses({ limit: 50 }),
  ]);

  const sales = report.sales ?? {};
  const purchases = report.purchases ?? {};
  const profit = Number(report.profit ?? 0);

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
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        {formatDate(report.from)} – {formatDate(report.to)}
      </h2>

      <StatGrid>
        <StatTile label="Sales" value={formatPKR(sales.sale_amount)} sub={formatLitres(sales.litres_sold)} />
        <StatTile label="Fuel bought" value={formatPKR(purchases.total_cost)} sub={formatLitres(purchases.quantity_litres)} />
        <StatTile label="Expenses" value={formatPKR(report.expenses_total)} />
        <StatTile
          label="Profit"
          value={formatPKR(profit)}
          tone={profit >= 0 ? 'positive' : 'negative'}
          sub="sales − fuel − expenses"
        />
      </StatGrid>

      <p className="mt-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-600">
        Profit here counts fuel <span className="font-semibold">bought</span> this month, not fuel
        sold from stock. A big delivery near month end therefore makes profit look low — that money
        is sitting in the tank, which is what the closing stock figure below shows.
      </p>

      {/* ---- cash / credit + pending ---- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Cash taken</p>
          <p className="tabular mt-1 text-xl font-bold text-ink-900">
            {formatPKR(sales.cash_amount)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Given on credit</p>
          <p className="tabular mt-1 text-xl font-bold text-ink-900">
            {formatPKR(sales.credit_amount)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Owed to suppliers
          </p>
          <p
            className={`tabular mt-1 text-xl font-bold ${
              Number(purchases.pending_amount ?? 0) > 0 ? 'text-red-700' : 'text-ink-900'
            }`}
          >
            {formatPKR(purchases.pending_amount)}
          </p>
        </div>
      </div>

      {/* ---- closing stock ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
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
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
        {formatMonth(year, month)} day by day
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Daily sales</h3>
          <SalesTrendChart data={trend} height={280} />
        </section>
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Cash vs credit</h3>
          <CashCreditChart data={trend} height={280} />
        </section>
      </div>

      {/* The same 30 days as numbers - for anyone who cannot read the charts,
          and for checking a specific day without hovering. */}
      <details className="card mt-4 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">
          Show these days as a table
        </summary>
        <div className="table-scroll mt-4">
          <table className="w-full min-w-[38rem]">
            <thead className="border-b border-ink-200 bg-ink-50">
              <tr>
                <th className="th">Date</th>
                <th className="th text-right">Litres</th>
                <th className="th text-right">Petrol</th>
                <th className="th text-right">Diesel</th>
                <th className="th text-right">Sales</th>
                <th className="th text-right">Cash</th>
                <th className="th text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {trend.map((row) => (
                <tr key={row.day}>
                  <td className="td whitespace-nowrap">{formatDate(row.day)}</td>
                  <td className="td-num">{formatLitres(row.litres_sold)}</td>
                  <td className="td-num">{formatLitres(row.petrol_litres)}</td>
                  <td className="td-num">{formatLitres(row.diesel_litres)}</td>
                  <td className="td-num font-semibold">{formatPKR(row.sale_amount)}</td>
                  <td className="td-num">{formatPKR(row.cash_amount)}</td>
                  <td className="td-num">{formatPKR(row.credit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* ---- expenses ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">
        Expenses
      </h2>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
        <ExpenseForm />

        <div>
          {(report.expenses_by_category ?? []).length > 0 ? (
            <div className="card mb-4 p-4">
              <h3 className="mb-3 text-sm font-bold text-ink-900">
                This month, by category
              </h3>
              <ul className="space-y-2">
                {report.expenses_by_category.map((row) => (
                  <li key={row.category} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-700">{row.category}</span>
                    <span className="tabular font-semibold text-ink-900">
                      {formatPKR(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {expenses.length === 0 ? (
            <p className="card px-4 py-6 text-center text-sm text-ink-500">
              No expenses recorded yet.
            </p>
          ) : (
            <div className="card table-scroll">
              <table className="w-full min-w-[34rem]">
                <thead className="border-b border-ink-200 bg-ink-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Category</th>
                    <th className="th">Note</th>
                    <th className="th text-right">Amount</th>
                    {/* The column still needs to occupy a cell, so the label
                        is hidden rather than the header itself. */}
                    <th className="th">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="td whitespace-nowrap">{formatDate(expense.expense_date)}</td>
                      <td className="td font-medium">{expense.category}</td>
                      <td className="td text-ink-600">{expense.note ?? '—'}</td>
                      <td className="td-num font-semibold">{formatPKR(expense.amount)}</td>
                      <td className="td">
                        <DeleteExpenseButton
                          expenseId={expense.id}
                          summary={`${expense.category} ${formatPKR(expense.amount)}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
