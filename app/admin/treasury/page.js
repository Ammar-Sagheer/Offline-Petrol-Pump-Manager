import {
  requirePageRole,
  ROLES,
  formatDate,
  formatPKR,
  formatNumber,
} from '@/app/_lib/helpers';
import { getTreasuryOverview, getTreasuryDay } from '@/app/_lib/data-service';
import { treasuryCategoryLabel } from '@/app/_lib/treasury-categories';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import CategoryBreakdown from '@/app/_components/admin/CategoryBreakdown';
import TrendRange, { trendDaysFrom } from '@/app/_components/admin/TrendRange';
import TreasuryBalanceChart from '@/app/_components/admin/TreasuryBalanceChart';
import TreasuryEntryForm from '@/app/_components/admin/TreasuryEntryForm';
import DeleteTreasuryEntryButton from '@/app/_components/admin/DeleteTreasuryEntryButton';
import TreasuryDayNav from '@/app/_components/admin/TreasuryDayNav';

export const metadata = { title: 'Treasury' };

/**
 * The cash in the safe on the pump site.
 *
 * WHAT THIS IS FOR. Money physically kept on site, in notes: the day's takings
 * before they are banked, cash lent to people and taken back, cash handed to a
 * supplier against a purchase code, and a working float for whatever the pump
 * needs paying for that hour. None of it is in the banking system, so nothing
 * else in this app knows about it.
 *
 * Owner only, like Banking and Expenses. This is his own cash.
 */
/*
 * THE BALANCE COLUMN IS PINNED.
 *
 * `RegisterTable` established the pattern (see "A table too wide to read: pin
 * the ends, scroll the middle" in docs/UI_CONVENTIONS.md) and pins BOTH ends.
 * This table pins one, deliberately. The register's middle is eight columns
 * wide, so two pinned ends still leave something worth scrolling; this one's
 * middle is four, and at 400px a second pinned column would leave about 140px
 * of scrollport for a reason, an amount in and an amount out — which is the
 * "at 400px the pinned columns are very nearly the whole table" failure the
 * register wrote down, arrived at from the other direction.
 *
 * So the right-hand end is pinned and the reason column scrolls. The balance
 * is what this page exists to show — it is the column the owner kept the
 * spreadsheet for — and it was off the right-hand edge on a phone before this.
 *
 * (The DATE column that used to lead this table is gone entirely: a page is
 * one day now, so every row shared it and it belonged in the heading. That
 * bought back about 110px, which is why the middle can afford to scroll.)
 *
 * THE BALANCE AND THE DELETE BUTTON SHARE ONE CELL, and that is not tidiness.
 * As two pinned cells the outer one needs `right: <width of everything right
 * of it>`, which the convention warns about in as many words — and the number
 * was wrong: the action column is 3rem of button plus the `.td` padding, so it
 * renders at 68px, and offsetting the balance by 3rem painted the last 8px of
 * every figure underneath it. `Rs 1,781,910` lost its last digit on a phone
 * and the DOM check said nothing, because the text was not overflowing its own
 * box — another cell was simply on top of it. One cell at `right: 0` has no
 * offset to get wrong.
 *
 * It also keeps the delete button reachable. Pinned alone at `right: 0`, the
 * balance would sit over the action column at every scroll position and the
 * button could never be tapped.
 *
 * Opaque white — a pinned cell that is not lets the row slide through it — and
 * white rather than a tint because, unlike the register's cumulative block,
 * this is not a group of its own; it is the end of an ordinary table that
 * happens to stay put.
 */
const PIN_RIGHT = 'pinned pinned-right';
const BALANCE_PIN = {
  right: 0,
  width: '11rem',
  minWidth: '11rem',
  backgroundColor: '#fff',
};

export default async function TreasuryPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const days = trendDaysFrom(params);

  /*
   * `?date=` picks the day, and anything at all is safe to pass: the RPC
   * resolves a day with no entries to the nearest one that has some, so the
   * page can never render an empty table. Only the shape is checked here -
   * whether that date exists is the database's question, not this one's.
   */
  const askedFor = /^\d{4}-\d{2}-\d{2}$/.test(params?.date ?? '') ? params.date : null;

  const [overview, dayPage] = await Promise.all([
    getTreasuryOverview(days),
    getTreasuryDay(askedFor),
  ]);

  const balance = Number(overview?.balance ?? 0);
  const daily = overview?.daily ?? [];

  const entries = dayPage?.entries ?? [];
  const day = dayPage?.day ?? null;
  const dayOpening = Number(dayPage?.opening ?? 0);
  const dayIn = Number(dayPage?.cash_in ?? 0);
  const dayOut = Number(dayPage?.cash_out ?? 0);
  const dayClosing = Number(dayPage?.closing ?? 0);

  // Asked for one day and landed on another - because the day asked for has
  // nothing on it. Said out loud rather than silently showing a different day.
  const landedElsewhere = askedFor !== null && day !== null && askedFor !== day;

  /*
   * The sparkline is the safe's closing balance day by day - the same series
   * the chart's line draws, so the shape in the tile and the shape further
   * down the page are the same shape. Its readouts are formatted HERE, on the
   * server: Sparkline cannot format, deliberately, because a formatter does
   * not cross the server/client boundary and re-implementing PKR in there is
   * how two parts of one app start writing money two ways.
   */
  const spark = daily.map((row) => Number(row.closing ?? 0));
  const sparkTips = daily.map((row) => ({
    v: formatPKR(row.closing),
    d: formatDate(row.day),
  }));

  const outByCategory = (overview?.out_by_category ?? []).map((row) => [
    treasuryCategoryLabel('out', row.category),
    Number(row.amount ?? 0),
  ]);
  const inByCategory = (overview?.in_by_category ?? []).map((row) => [
    treasuryCategoryLabel('in', row.category),
    Number(row.amount ?? 0),
  ]);

  const windowIn = Number(overview?.window_in ?? 0);
  const windowOut = Number(overview?.window_out ?? 0);

  /*
   * "14 days to 21 Aug 2026", not "over the last 14 days".
   *
   * The window ends at the LAST ENTRY rather than at today (migration 033), so
   * on any day nothing has been written down yet the two are different dates -
   * and "the last 14 days" would be describing a window that had quietly
   * stopped moving. Naming the day it ends on costs four words and cannot go
   * stale. On a day the sheet is up to date it reads as today's date, which is
   * what it is.
   */
  const windowLabel = overview?.window_to
    ? `${days} days to ${formatDate(overview.window_to)}`
    : `Over the last ${days} days`;

  /* The chart's window control and the day being read share a URL, so each has
     to carry the other's parameter or pressing one would silently reset the
     other - send the reader back to the newest day for changing the chart to
     30 days, or redraw the chart for stepping back a day. */
  const hrefWith = (next = {}) => {
    // The day currently on screen is the default; anything passed in wins, so
    // the day arrows can point somewhere else while the chart's window rides
    // along untouched.
    const query = new URLSearchParams({
      days: String(days),
      ...(day ? { date: day } : {}),
      ...next,
    });
    return `/admin/treasury?${query.toString()}`;
  };

  const isEmpty = Number(overview?.entry_count ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Treasury"
        description="The cash kept in the safe on site — what came in, what went out, what is left."
      >
        {/* The one thing this page is opened to do, so it is the one button in
            the header rather than a form competing with the table for width -
            see TreasuryEntryForm on why it is not standing open beside it. */}
        {isEmpty ? null : <TreasuryEntryForm balance={balance} />}
      </PageHeader>

      {isEmpty ? (
        <EmptyState
          title="Nothing in the safe yet"
          description="Record what the safe already holds as “Already in the safe”, then add each movement as it happens. Every line after that carries the balance with it."
        >
          <TreasuryEntryForm balance={0} trigger="empty" />
        </EmptyState>
      ) : (
        <>
          <section aria-label="The safe at a glance" className="mb-6">
            <StatGrid columns={4}>
              <StatTile
                icon="treasury"
                label="In the safe now"
                value={formatPKR(balance)}
                tone={balance < 0 ? 'negative' : 'default'}
                spark={spark.length > 1 ? spark : undefined}
                sparkTips={spark.length > 1 ? sparkTips : undefined}
              />
              <StatTile
                icon="moneyIn"
                label="Cash in"
                value={formatPKR(windowIn)}
                sub={windowLabel}
              />
              <StatTile
                icon="moneyOut"
                label="Cash out"
                value={formatPKR(windowOut)}
                sub={windowLabel}
              />
              <StatTile
                icon="list"
                label="Entries recorded"
                value={formatNumber(overview?.entry_count ?? 0)}
                sub={
                  overview?.first_date
                    ? `Since ${formatDate(overview.first_date)}`
                    : undefined
                }
              />
            </StatGrid>
          </section>

          <div className="card mb-6 p-4">
            {/* The heading and the window control share a line, and the control
                keeps the reader where they are (`scroll={false}` inside
                TrendRange) - the only thing that changes is inside this card. */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink-900">Day by day</h2>
                <p className="text-sm text-ink-600">
                  What went in, what came out, and what the safe was left holding each evening.
                </p>
              </div>
              <TrendRange days={days} hrefFor={(window) => hrefWith({ days: String(window) })} />
            </div>

            <TreasuryBalanceChart daily={daily} />
          </div>

          {/* Two breakdowns rather than one, because the safe has two stories
              and only one of them is the usual "where did it go". Where the
              cash CAME FROM is the check on whether the day's takings are
              actually reaching the safe. */}
          {outByCategory.length > 0 || inByCategory.length > 0 ? (
            <div className="mb-2 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              {inByCategory.length > 0 ? (
                <CategoryBreakdown
                  title="Where it came from"
                  rows={inByCategory}
                  total={windowIn}
                />
              ) : null}
              {outByCategory.length > 0 ? (
                <CategoryBreakdown title="Where it went" rows={outByCategory} total={windowOut} />
              ) : null}
            </div>
          ) : null}

          {/* The table gets the whole page: five columns, three of them money
              that must not wrap, is more than the 1fr track of a
              form-beside-a-table split can hold at this app's max-w-6xl cap. */}
          <div>
            <div>
              {/* The day IS the heading, because the day is the page. Every row
                  below shares it, which is exactly why it is no longer a
                  column. */}
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold text-ink-900">
                  {day ? formatDate(day) : 'Entries'}
                </h2>
                <p className="text-sm text-ink-600">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'} on this day
                </p>
              </div>

              {/* Picked a day with nothing on it and landed on the nearest one
                  that has something. Said out loud - a page that quietly shows
                  a different day than the one asked for is a page that will be
                  misread as the day asked for. */}
              {landedElsewhere ? (
                <p className="mb-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700">
                  Nothing was recorded on{' '}
                  <span className="font-semibold text-ink-900">{formatDate(askedFor)}</span>. This
                  is the nearest day before it that has entries.
                </p>
              ) : null}

              {/* WHAT THE DAY OPENED AND CLOSED ON, which the 25-row view could
                  not show at all: its rows started and stopped mid-day, so
                  there was no such figure to print. It is the number the owner
                  actually checks - he counts the notes in the safe at the end
                  of the evening and compares. Opening and closing are the same
                  ink as the balance column they belong to; the two movements
                  keep the green and amber they wear everywhere else. */}
              <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                    Opened with
                  </dt>
                  <dd className="tabular whitespace-nowrap text-base font-bold text-ink-900">
                    {formatPKR(dayOpening)}
                  </dd>
                </div>
                <div className="rounded-lg bg-brand-50 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                    Cash in
                  </dt>
                  <dd className="tabular whitespace-nowrap text-base font-bold text-brand-700">
                    {formatPKR(dayIn)}
                  </dd>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                    Cash out
                  </dt>
                  <dd className="tabular whitespace-nowrap text-base font-bold text-amber-800">
                    {formatPKR(dayOut)}
                  </dd>
                </div>
                <div className="rounded-lg border border-ink-300 bg-ink-50 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-700">
                    Closed at
                  </dt>
                  <dd
                    className={`tabular whitespace-nowrap text-base font-bold ${
                      dayClosing < 0 ? 'text-red-700' : 'text-ink-900'
                    }`}
                  >
                    {formatPKR(dayClosing)}
                  </dd>
                </div>
              </dl>

              {entries.length === 0 ? (
                <EmptyState
                  title="Nothing recorded on this day"
                  description="Use Record cash to add the first entry."
                />
              ) : (
                /* 43rem is the sum of what the four columns actually need,
                   measured rather than guessed: "Fuel or code transfer" on one
                   line is 190px, the widest In is 146px with its arrow, the
                   widest Out 164px, and the pinned balance block is a fixed
                   176px. At 36rem - which looked ample, since the date column
                   had just left - the total fell 100px short of that and the
                   browser took it out of the nowrap money cells, clipping
                   "Rs 135,000" to "Rs 135,0" and breaking the reason column one
                   word to a line on a phone. */
                <div className="card table-scroll has-pinned-columns">
                  <table className="w-full min-w-[43rem]">
                    <thead className="border-b border-ink-200 bg-ink-50">
                      <tr>
                        <th className="th">What for</th>
                        <th className="th text-right">In</th>
                        <th className="th text-right">Out</th>
                        <th className={`th text-right ${PIN_RIGHT}`} style={BALANCE_PIN}>
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {entries.map((entry) => {
                        const isIn = entry.direction === 'in';
                        const label = treasuryCategoryLabel(entry.direction, entry.category);
                        const balanceAfter = Number(entry.balance_after ?? 0);

                        return (
                          <tr key={entry.id}>
                            <td className="td">
                              <span>{label}</span>
                              {/* The owner's own words, under the reason he
                                  picked. Left to wrap - a real detail line
                                  naming who is holding the money must not be
                                  truncated. */}
                              {entry.details ? (
                                <span className="block text-sm text-ink-600">{entry.details}</span>
                              ) : null}
                            </td>
                            {/* The arrow is the second cue beside the colour,
                                per the icons rule - the two columns are
                                otherwise identical in shape, and green-vs-amber
                                alone is what a colourblind reader cannot use. */}
                            <td className="td-num font-semibold text-brand-700">
                              {isIn ? (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyIn" className="h-4 w-4" />
                                  {formatPKR(entry.amount)}
                                </span>
                              ) : (
                                ''
                              )}
                            </td>
                            <td className="td-num font-semibold text-amber-800">
                              {isIn ? (
                                ''
                              ) : (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyOut" className="h-4 w-4" />
                                  {formatPKR(entry.amount)}
                                </span>
                              )}
                            </td>
                            {/* The column the sheet was really kept for. Set
                                in ink rather than in either movement colour:
                                it is not money arriving or leaving, it is
                                what was there afterwards. */}
                            <td className={`td-num ${PIN_RIGHT}`} style={BALANCE_PIN}>
                              <span className="flex items-center justify-end gap-1">
                                <span
                                  className={`font-bold ${
                                    balanceAfter < 0 ? 'text-red-700' : 'text-ink-900'
                                  }`}
                                >
                                  {formatPKR(balanceAfter)}
                                </span>
                                <DeleteTreasuryEntryButton
                                  entryId={entry.id}
                                  summary={`${formatPKR(entry.amount)} ${
                                    isIn ? 'in' : 'out'
                                  } on ${formatDate(entry.entry_date)}`}
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <TreasuryDayNav
                day={day}
                prevDay={dayPage?.prev_day ?? null}
                nextDay={dayPage?.next_day ?? null}
                dayIndex={Number(dayPage?.day_index ?? 0)}
                dayCount={Number(dayPage?.day_count ?? 0)}
                hrefForDay={(date) => hrefWith({ date })}
                carried={{ days: String(days) }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
