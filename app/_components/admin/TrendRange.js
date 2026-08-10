import PendingLink from '@/app/_components/ui/PendingLink';

/**
 * How far back the dashboard charts look.
 *
 * FOUR FIXED WINDOWS RATHER THAN TWO DATE BOXES. The charts already end on the
 * day chosen by `<DateNav>` at the top of the page, so the only thing missing
 * was how far back from it to go — and asked as a from/to pair that is two
 * date pickers, four taps and a way to enter a range that is backwards or
 * empty. One tap, no invalid states, and the day the window ends on is still
 * whatever the rest of the dashboard is showing.
 *
 * The four are the questions actually asked of this pump: last week, the
 * fortnight the charts always showed, the month, the quarter. 90 days is the
 * longest a daily bar stays readable at this width — beyond that the bars are
 * hairlines and a month-by-month view would be the right answer instead.
 *
 * THE CURRENT WINDOW IS A `<span>`, NOT A LINK, the same rule as the dead
 * button in `<Pager>`: a link styled to look inert is still focusable and
 * still navigates, which sends the reader to the page they are already on.
 */
export const TREND_WINDOWS = [7, 14, 30, 90];

export const DEFAULT_TREND_DAYS = 14;

/** Reads `?days=` and falls back to the default rather than trusting it. */
export function trendDaysFrom(params) {
  const asked = Number(params?.days);
  return TREND_WINDOWS.includes(asked) ? asked : DEFAULT_TREND_DAYS;
}

export default function TrendRange({ days, hrefFor }) {
  return (
    <div
      role="group"
      aria-label="How far back the charts look"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-300 bg-white p-1"
    >
      {TREND_WINDOWS.map((window) => {
        const label = `${window} days`;

        return window === days ? (
          <span
            key={window}
            aria-current="true"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            {label}
          </span>
        ) : (
          <PendingLink
            key={window}
            href={hrefFor(window)}
            /*
             * STAY WHERE THE READER IS. A Link resets the scroll to the top by
             * default, which is right when the whole page changes and wrong
             * here: the charts are the last thing on the Dashboard, so asking
             * for 30 days instead of 7 threw the reader back up past the tiles
             * and the tanks to look at a chart they were already looking at.
             * The only thing that changes is inside the two cards below.
             *
             * Measured both ways rather than assumed: without it the page went
             * from scrollY 1087 to 0 and the control jumped from 379px down
             * the viewport to 1466px off the top of it.
             */
            scroll={false}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold
                       text-ink-700 hover:bg-ink-100 hover:text-ink-900"
          >
            {label}
          </PendingLink>
        );
      })}
    </div>
  );
}
