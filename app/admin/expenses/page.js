import {
  requirePageRole,
  ROLES,
  todayISO,
  monthRange,
  formatMonth,
  formatDate,
  formatPKR,
} from '@/app/_lib/helpers';
import { getExpenses, getExpenseCategories } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import CategoryBreakdown from '@/app/_components/admin/CategoryBreakdown';
import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import ExpenseForm from '@/app/_components/admin/ExpenseForm';
import DeleteExpenseButton from '@/app/_components/admin/DeleteExpenseButton';
import Button from '@/app/_components/ui/Button';

export const metadata = { title: 'Expenses' };

/**
 * What the pump spends: salaries, electricity, rent, repairs.
 *
 * Its own section rather than a block at the bottom of Reports, where it had
 * to be scrolled past charts and tables to reach. Reports is read once a
 * month; an expense is written down the day it is paid, which is everyday
 * work and belongs on a tab of its own.
 *
 * Owner only, like Reports and Banking - an expense feeds the profit figure,
 * and what the pump costs to run is not the staff's business.
 */
export default async function ExpensesPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const today = todayISO();

  // The month box posts back as YYYY-MM, the same as on Reports.
  const monthParam =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, month] = monthParam.split('-').map(Number);
  const { from, to } = monthRange(year, month);

  // The month on screen, not a rolling window: the table and the totals beside
  // it then describe the same rows, so the category list can be checked by
  // reading down the table rather than taken on trust.
  const [expenses, usedCategories] = await Promise.all([
    getExpenses({ from, to, limit: 200 }),
    getExpenseCategories(),
  ]);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

  // Biggest first - the point of the breakdown is which costs dominate the
  // month, and that ordering answers it without reading every line.
  const byCategory = Object.entries(
    expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] ?? 0) + Number(expense.amount ?? 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Expenses" description="What the pump spends, month by month.">
        <form method="GET" action="/admin/expenses" className="flex items-center gap-2">
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
      </PageHeader>

      {/* The shared tiles rather than this page's own one-off header card. It
          was the last page still rendering its total by hand, so the figure
          that matters most here was the only headline in the app not set like
          the others.

          TWO TILES, NOT THREE. A "biggest category" tile was tried and
          dropped: a category here is free text - this pump has one reading
          "salary of haseeb and pump tea and lunch" - and StatTile keeps its
          value on one line because it is built for money, so a sentence
          arrived truncated to "salary of haseeb…". The breakdown card below
          shows the same thing in full and in order, which is where a name
          belongs. A third tile repeating the total under "counted in profit"
          went with it; the same figure twice on one row is not a second fact,
          so that link moved into this tile's sub-line instead. */}
      <div className="mb-6">
        <StatGrid columns={2}>
          <StatTile
            icon="expenses"
            label={`Spent in ${formatMonth(year, month)}`}
            value={formatPKR(total)}
            sub={
              <>
                {expenses.length} expense{expenses.length === 1 ? '' : 's'} ·{' '}
                <PendingLink
                  href={`/admin/reports?month=${monthParam}`}
                  className="font-semibold text-brand-700 underline"
                >
                  counted in profit
                </PendingLink>
              </>
            }
          />
          <StatTile
            icon="list"
            label="Categories used"
            value={String(byCategory.length)}
            sub={
              byCategory.length > 0 && total > 0
                ? `biggest is ${Math.round((byCategory[0][1] / total) * 100)}% of the month`
                : null
            }
          />
        </StatGrid>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
        {/* The form stays open on the page rather than behind a dialog: unlike
            adding a bank account or a tank, recording an expense is the reason
            this page is opened at all, and the table beside it fits the rest
            of the width comfortably. */}
        <ExpenseForm used={usedCategories} />

        <div>
          {byCategory.length > 0 ? (
            <CategoryBreakdown rows={byCategory} total={total} />
          ) : null}

          {expenses.length === 0 ? (
            <EmptyState
              title="Nothing recorded for this month"
              description="Record what the pump has paid out using the form — salaries, electricity, rent, repairs. Pick a different month above to see what was spent then."
            />
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
