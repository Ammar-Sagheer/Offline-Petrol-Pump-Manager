'use client';

import { useEffect, useState } from 'react';

/**
 * The day's running totals, pinned to the bottom of the screen while the
 * nozzles are being entered.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY IT IS NOT A SECOND COPY OF THE TILES
 * ---------------------------------------------------------------------------
 * The figures on this bar are the same four the stat tiles carry at the top of
 * the page, and showing both at once would be exactly the duplication the
 * conventions warn about - "say it once", the note that got the date down from
 * three simultaneous statements to one.
 *
 * So this is not shown at once. It appears ONLY WHEN THE TILES HAVE SCROLLED
 * OUT OF VIEW, and hides again the moment they come back. At any given moment
 * the day's totals are on screen exactly once; which of the two carries them
 * depends on where the reader has got to.
 *
 * That is worth the machinery because of what this page is for. The last
 * nozzle is a long way down a six-row page, and the question being answered
 * while typing into it is "does this match the notes in the drawer" - a
 * question about the day's total, asked at the point furthest from where the
 * day's total used to be. Before this, checking meant scrolling back up, which
 * is why the dialog carried its own little running total: the page's own
 * figures were unreachable from inside the task.
 *
 * ---------------------------------------------------------------------------
 * AN OBSERVER, NOT A SCROLL HANDLER
 * ---------------------------------------------------------------------------
 * `IntersectionObserver` fires only when the tiles actually cross the edge of
 * the viewport, off the main thread. A scroll listener would run on every
 * frame of every scroll to answer the same question, on a cheap tablet, on the
 * screen this app is used on most.
 *
 * `SUPPRESSED WHEN NOTHING IS ENTERED`. On a fresh day every figure is zero
 * and the bar would be a strip of "Rs 0" following the reader down a page they
 * have not started - the same fault the top tiles have on an empty day, but
 * this one moves. It appears with the first saved nozzle.
 */
export default function ReadingsCashUpBar({ watchId, entered, total, litres, cash, credit }) {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const tiles = document.getElementById(watchId);
    if (!tiles) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setShowing(!entry.isIntersecting),
      // A hair of margin, so the bar does not flicker in and out while the
      // tiles sit exactly on the edge of the viewport.
      { rootMargin: '-8px 0px 0px 0px' },
    );

    observer.observe(tiles);
    return () => observer.disconnect();
  }, [watchId]);

  if (entered === 0) return null;

  const allDone = entered === total;

  return (
    <div
      /*
       * `lg:pl-60` matches the admin layout's own sidebar offset, so the bar
       * starts where the content does rather than running underneath the nav.
       * The two numbers have to agree - see app/admin/layout.js, which carries
       * the same comment about the only other place 60 appears.
       *
       * aria-hidden while it is off screen, so a screen reader is not read the
       * same four figures twice - it already has them from the tiles.
       */
      aria-hidden={!showing}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:pl-60
                  transition-transform duration-200 ease-out
                  ${showing ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <div className="@container mx-auto w-full max-w-6xl px-4 pb-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-ink-900 px-4 py-3 shadow-lg">
          {/* Progress first, because it answers "am I finished" - and it is
              the one figure here the tiles state as a fraction rather than as
              money, so it never reads as a total. */}
          <span
            className={`badge shrink-0 ${
              allDone ? 'bg-brand-500 text-ink-900' : 'bg-white/15 text-white'
            }`}
          >
            {entered} of {total} entered
          </span>

          {/* LITRES DROP OUT ON A PHONE. All four figures wrapped to three
              lines at 400px - about 90px of a short screen, permanently, over
              the row being typed into. The question this bar exists to answer
              is "does this match the notes in the drawer", and litres are the
              one figure that answers none of it. Cash and credit stay at every
              width. A container query, not `sm:` - the bar is inset by the
              sidebar on a laptop, so its width and the window's are not the
              same number (see "Responsive: measure the container"). */}
          <BarFigure label="Sold" value={litres} className="hidden @[30rem]:flex" />
          <BarFigure label="Cash" value={cash} />
          <BarFigure label="Credit" value={credit} />
        </div>
      </div>
    </div>
  );
}

/**
 * One figure on the bar.
 *
 * `text-lg` on the value against `text-xs` on the label - the same ratio the
 * `figure-label` / `figure-value` pair uses everywhere else, so the strip does
 * not quietly become the one place in the app where a number is smaller than
 * the word describing it. The label is `ink-300` on near-black rather than the
 * `ink-600` used on white; the grey floor in the conventions is about contrast
 * against the surface, and this surface is inverted.
 */
function BarFigure({ label, value, className = '' }) {
  return (
    <span className={`flex min-w-0 items-baseline gap-2 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-300">{label}</span>
      <span className="tabular whitespace-nowrap text-lg font-bold text-white">{value}</span>
    </span>
  );
}
