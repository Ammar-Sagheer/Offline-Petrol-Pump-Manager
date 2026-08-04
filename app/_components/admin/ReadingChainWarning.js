'use client';

/**
 * Tells you when a nozzle's readings do not join up.
 *
 * A meter is continuous, so each reading's opening should equal the previous
 * reading's closing. Two things break that, and both quietly double-count:
 *
 *   BACK-FILLING - you missed the 3rd, entered the 4th, and are now going back.
 *   The 4th was saved with the 2nd's closing as its opening, so it already
 *   covers the 3rd's litres. Saving here counts them twice.
 *
 *   A GAP - the last reading for this nozzle is older than yesterday, so this
 *   entry silently covers several days rather than one.
 *
 * Warnings only. Meters really do get replaced or reset, and blocking the save
 * would trap someone with no way forward. The point is that it is never a
 * surprise afterwards.
 */
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = String(fromISO).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = String(toISO).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function pretty(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

export default function ReadingChainWarning({ row, date, openingUsed }) {
  const previousClosing =
    row.previous_closing === null || row.previous_closing === undefined
      ? null
      : Number(row.previous_closing);
  const laterOpening =
    row.later_opening === null || row.later_opening === undefined
      ? null
      : Number(row.later_opening);

  const messages = [];

  // Back-filling into a gap that a later reading already swallowed.
  if (row.later_date) {
    const laterSpansThisDay =
      previousClosing !== null && laterOpening !== null && laterOpening === previousClosing;

    messages.push({
      tone: laterSpansThisDay ? 'danger' : 'warn',
      text: laterSpansThisDay
        ? `The reading already saved for ${pretty(row.later_date)} opens at ` +
          `${litreFormat.format(laterOpening)}, the same place this day starts — so it already ` +
          `includes these litres. Saving here will count them twice. Correct ` +
          `${pretty(row.later_date)} first.`
        : `A reading already exists for ${pretty(row.later_date)}. Check that its opening ` +
          `matches whatever you close this day at, or the two will overlap.`,
    });
  }

  // A gap behind us: this entry covers more than one day.
  if (row.previous_date) {
    const gap = daysBetween(row.previous_date, date);
    if (gap > 1) {
      messages.push({
        tone: 'warn',
        text: `The last reading for this nozzle was ${pretty(row.previous_date)}, ${gap} days ` +
              `back. This entry therefore covers ${gap} days of sales, not one.`,
      });
    }
  }

  // The opening does not continue from the previous closing.
  if (
    previousClosing !== null &&
    openingUsed !== null &&
    openingUsed !== undefined &&
    Number(openingUsed) !== previousClosing
  ) {
    messages.push({
      tone: 'danger',
      text: `This reading opens at ${litreFormat.format(Number(openingUsed))} but the previous ` +
            `reading (${pretty(row.previous_date)}) closed at ` +
            `${litreFormat.format(previousClosing)}. The meter cannot jump — these two rows ` +
            `overlap or leave a hole.`,
    });
  }

  // First ever reading on this nozzle - worth saying, not worth alarming over.
  if (previousClosing === null && !row.reading_id) {
    messages.push({
      tone: 'info',
      text: 'First reading for this nozzle, so it opens at 0. Every later day will carry on from ' +
            'wherever you close it.',
    });
  }

  if (messages.length === 0) return null;

  const styles = {
    danger: 'border-red-300 bg-red-50 text-red-800',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-ink-200 bg-ink-50 text-ink-600',
  };

  return (
    <div className="space-y-2">
      {messages.map((message, index) => (
        <p
          key={index}
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${styles[message.tone]}`}
        >
          {message.text}
        </p>
      ))}
    </div>
  );
}
