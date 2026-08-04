import PendingLink from '@/app/_components/ui/PendingLink';

import { todayISO, shiftISODate, formatDate } from '@/app/_lib/date-helpers';

/**
 * Previous / next day, a date box, and a way back to today.
 *
 * The form is a plain GET, so it still works before JavaScript has loaded -
 * which on a slow connection in a pump office is a real scenario.
 *
 * Note the `key` on the date input. It is uncontrolled, so React will not push
 * a new defaultValue into a field that is already on screen: stepping through
 * days with the arrows changed the page underneath while the box carried on
 * showing the old date. Keying it by the date remounts it, so what it displays
 * is always the day being shown.
 *
 * Anything passed as children joins the end of the button row. A page-level
 * action for the day on screen belongs on the same line as the day's controls,
 * sharing their height and baseline, rather than floating beside the block and
 * centring itself against the date caption underneath.
 */
export default function DateNav({
  date,
  basePath,
  previousDate,
  nextDate,
  paramName = 'date',
  children,
}) {
  const today = todayISO();
  const isToday = date === today;
  const isYesterday = date === shiftISODate(today, -1);
  const isFuture = date > today;

  const relativeLabel = isToday
    ? 'Today'
    : isYesterday
      ? 'Yesterday'
      : isFuture
        ? 'Future date'
        : null;

  const labelStyle = isToday
    ? 'bg-brand-100 text-brand-800'
    : isFuture
      ? 'bg-amber-100 text-amber-900'
      : 'bg-ink-200 text-ink-700';

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <PendingLink
          href={`${basePath}?${paramName}=${previousDate}`}
          className="btn-secondary px-3"
          aria-label={`Go to ${formatDate(previousDate)}`}
          spinnerOnly
        >
          <span aria-hidden="true">‹</span>
        </PendingLink>

        <form method="GET" action={basePath} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="date-nav">
            Date
          </label>
          <input
            key={date}
            id="date-nav"
            type="date"
            name={paramName}
            defaultValue={date}
            className="input py-2"
          />
          <button type="submit" className="btn-secondary">
            Go
          </button>
        </form>

        <PendingLink
          href={`${basePath}?${paramName}=${nextDate}`}
          className="btn-secondary px-3"
          aria-label={`Go to ${formatDate(nextDate)}`}
          spinnerOnly
        >
          <span aria-hidden="true">›</span>
        </PendingLink>

        {/* Only worth showing when it would actually do something. */}
        {!isToday ? (
          <PendingLink href={basePath} className="btn-primary py-2 text-xs">
            Back to today
          </PendingLink>
        ) : null}

        {children}
      </div>

      {/* Which day is on screen, in words - the date box alone is easy to skim
          past, and entering a reading against the wrong day is expensive. */}
      <p className="flex items-center gap-1.5 text-xs text-ink-600">
        {relativeLabel ? (
          <span className={`badge ${labelStyle}`}>{relativeLabel}</span>
        ) : null}
        <span className="font-medium">{formatDate(date)}</span>
      </p>
    </div>
  );
}
