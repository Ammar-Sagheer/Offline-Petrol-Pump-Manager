import DateJump from '@/app/_components/admin/DateJump';
import Icon from '@/app/_components/ui/Icon';

import { todayISO, shiftISODate, formatDate, formatDateLong } from '@/app/_lib/date-helpers';
import Button from '@/app/_components/ui/Button';

/**
 * Previous / next day, a date box, and a way back to today.
 *
 * The date box lives in DateJump because it needs to be a Client Component to
 * navigate the moment a date is picked; everything else here stays on the
 * server. See that file for why picking a date is enough on its own and what
 * the old Go button was costing.
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
  extraParams,
  children,
}) {
  /*
   * Anything else already in the query string that must survive stepping a
   * day. The Dashboard's chart window is the only one so far: without this,
   * pressing the next-day arrow with a 90-day window open would drop back to
   * 14 and the reader would blame the arrow.
   */
  const carried = new URLSearchParams(extraParams ?? {}).toString();
  const dateHref = (value) =>
    `${basePath}?${paramName}=${value}${carried ? `&${carried}` : ''}`;
  const todayHref = carried ? `${basePath}?${carried}` : basePath;

  const today = todayISO();
  const isToday = date === today;
  const isYesterday = date === shiftISODate(today, -1);
  const isFuture = date > today;

  /*
   * There is ALWAYS a label now, including for an ordinary past day, which
   * used to render none at all. A day with no label looked the same as today
   * at a glance, and that is the mistake this whole block exists to prevent:
   * a reading entered against a day the reader did not think they were on.
   */
  const relativeLabel = isToday
    ? 'Today'
    : isYesterday
      ? 'Yesterday'
      : isFuture
        ? 'Future date'
        : 'Past day';

  const labelStyle = isToday
    ? 'bg-brand-100 text-brand-800'
    : isFuture
      ? 'bg-amber-200 text-amber-900'
      : 'bg-ink-200 text-ink-800';

  // The banner is tinted when the day is NOT today, so being somewhere else is
  // something you notice rather than something you have to read for.
  const bannerStyle = isToday
    ? 'border-brand-200 bg-brand-50'
    : isFuture
      ? 'border-amber-300 bg-amber-50'
      : 'border-ink-300 bg-ink-100';

  return (
    <div className="flex flex-col items-start gap-2">
      {/*
        WHICH DAY IS ON SCREEN, said once and said loudly.
        
        This used to be a line of small grey text under the controls, competing
        with a date box the browser draws in its own locale and a copy of the
        date in the page description. Three quiet statements of the same fact,
        none of them dominant - and the owner lost track of which day he was
        entering, which is how a day's readings ended up on the wrong date.
        
        So: one banner, larger than anything else in the block, carrying the
        weekday (checkable against the day you have actually lived), the
        written date, and what that day is relative to today. Tinted whenever
        it is not today.
      */}
      <p
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${bannerStyle}`}
      >
        <span className={`badge ${labelStyle}`}>{relativeLabel}</span>
        <span className="text-lg font-bold text-ink-900">{formatDateLong(date)}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          href={dateHref(previousDate)}
          pending
          aria-label={`Go to ${formatDate(previousDate)}`}
          spinnerOnly
        >
          <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
        </Button>

        <DateJump date={date} basePath={basePath} paramName={paramName} extraParams={extraParams} />

        <Button
          variant="secondary"
          href={dateHref(nextDate)}
          pending
          aria-label={`Go to ${formatDate(nextDate)}`}
          spinnerOnly
        >
          <Icon name="chevronRight" className="h-5 w-5" />
        </Button>

        {/* Only worth showing when it would actually do something. */}
        {!isToday ? (
          <Button variant="primary" href={todayHref} pending>
            Back to today
          </Button>
        ) : null}

        {children}
      </div>

    </div>
  );
}
