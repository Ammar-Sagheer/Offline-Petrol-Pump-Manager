import { requirePageRole, ROLES, formatDate } from '@/app/_lib/helpers';
import { getSalesTrend, getFirstTradingDay } from '@/app/_lib/data-service';
import { todayISO, shiftISODate, daysBetween } from '@/app/_lib/date-helpers';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import Icon from '@/app/_components/ui/Icon';
import DailySalesTable from '@/app/_components/admin/DailySalesTable';
import Button from '@/app/_components/ui/Button';

export const metadata = { title: 'Daily sales' };

/**
 * Every day the pump has traded, newest first, a screenful at a time.
 *
 * Reports shows the same table for the month on screen, which is the right
 * thing when the question is "how did August go". This is for the other
 * question - "what did we take on the day that customer says he paid" - where
 * the month is not known in advance and paging back is the whole point.
 *
 * PAGED BY DATE, NOT BY ROW. get_sales_trend fills in every day between two
 * bounds, including the ones with no trade at all, so a page IS a fixed window
 * of days: page 1 is the last 25 days, page 2 the 25 before that. That is why
 * there is no row count to fetch - the number of pages falls out of the
 * distance between the first trading day and today.
 *
 * The page number is a query string, so Back works through it and any page can
 * be linked to or reloaded.
 */
const PER_PAGE = 25;

export default async function DailySalesPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const requested = Number.parseInt(params?.page, 10);
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const today = todayISO();
  const firstDay = (await getFirstTradingDay()) ?? today;

  const totalDays = Math.max(1, daysBetween(firstDay, today));
  const lastPage = Math.max(1, Math.ceil(totalDays / PER_PAGE));
  const safePage = Math.min(page, lastPage);

  // Walk backwards from today in PER_PAGE-sized windows, then clamp the far
  // edge so the last page stops at the first day rather than inventing history.
  const to = shiftISODate(today, -(safePage - 1) * PER_PAGE);
  const rawFrom = shiftISODate(to, -(PER_PAGE - 1));
  const from = rawFrom < firstDay ? firstDay : rawFrom;

  const trend = await getSalesTrend(from, to);

  // The RPC returns oldest first, which is right for a chart drawn left to
  // right. Read as a list, the day just gone belongs at the top.
  const rows = [...trend].reverse();

  return (
    <>
      <PendingLink
        href="/admin/reports"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
      >
        <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
        Back to Reports
      </PendingLink>

      <PageHeader
        title="Daily sales"
        description="Every day since the pump started trading, newest first. Days with nothing entered are shown as zero rather than skipped, so a gap in the book is visible."
      />

      {trend.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Once a day of readings has been entered it will appear here, and every day after it."
        />
      ) : (
        <>
          <DailySalesTable rows={rows} />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-800">{formatDate(from)}</span> to{' '}
              <span className="font-semibold text-ink-800">{formatDate(to)}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              trading since{' '}
              <span className="font-semibold text-ink-800">{formatDate(firstDay)}</span>
            </p>

            {lastPage > 1 ? (
              <nav aria-label="Pages" className="flex items-center gap-2">
                <PagerLink
                  href={`/admin/reports/daily?page=${safePage - 1}`}
                  disabled={safePage <= 1}
                  label="More recent days"
                >
                  <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
                  <span className="hidden sm:inline">Newer</span>
                </PagerLink>

                <span className="text-sm font-semibold text-ink-700">
                  Page {safePage} of {lastPage}
                </span>

                <PagerLink
                  href={`/admin/reports/daily?page=${safePage + 1}`}
                  disabled={safePage >= lastPage}
                  label="Earlier days"
                >
                  <span className="hidden sm:inline">Older</span>
                  <Icon name="chevronRight" className="h-5 w-5" />
                </PagerLink>
              </nav>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

/**
 * A page button that is a real link when it goes somewhere and inert when it
 * does not - rather than a link styled to look dead, which is still focusable
 * and still navigates.
 */
function PagerLink({ href, disabled, label, children }) {
  if (disabled) {
    return (
      <Button variant="secondary" disabled aria-disabled="true">
        {children}
      </Button>
    );
  }

  return (
    <Button variant="secondary" href={href} pending aria-label={label}>
      {children}
    </Button>
  );
}
