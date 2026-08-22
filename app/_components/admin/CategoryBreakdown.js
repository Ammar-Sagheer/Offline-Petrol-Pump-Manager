import LinearProgress from '@mui/material/LinearProgress';

import { formatPKR } from '@/app/_lib/helpers';

/**
 * Where the month's spending went, biggest first.
 *
 * A LIST OF FIGURES DOES NOT ANSWER THE QUESTION IT IS ASKED. This was
 * "category ......... Rs 7,035" repeated down a card, and the thing anyone
 * actually wants from a breakdown - which costs dominate the month - had to be
 * worked out by comparing numbers of different digit lengths. A bar answers it
 * without arithmetic, and the share in words answers it for anyone who cannot
 * judge a bar length (or is reading this in a dim office at arm's length).
 *
 * WHY MUI'S BAR HERE, when the tank gauges on the Dashboard and the unit
 * progress on Readings are hand-rolled divs. Those two are FILL gauges - how
 * full is this tank, how much of this pump is entered - and they are tuned to
 * sit inside a coloured band, so they carry their own track and fill colours.
 * This is a share-of-total bar in a plain list, which is exactly what
 * `LinearProgress` is, and using it here costs nothing the hand-rolled version
 * was buying. Worth knowing that the app now has both, and which to reach for:
 * a gauge inside a coloured surface is hand-rolled, a share in a list is MUI.
 *
 * The bar is decoration over the figure, never instead of it - the amount and
 * the percentage are both in text beside it, per the rule that colour and
 * shape are second cues rather than the carrier.
 *
 * NO `'use client'`. Nothing here is interactive, and leaving it a server
 * component is what lets it use `formatPKR` from helpers.js - that module
 * reads request cookies for the role checks, so it cannot be pulled into a
 * browser bundle. Importing MUI's own client component from a server one is
 * fine; only the props have to serialise, and these are an array and a number.
 */
/*
 * `title` is optional and defaults to what Expenses has always said, so that
 * page is untouched. Treasury renders two of these side by side - where the
 * cash came from and where it went - and "Where it went" on both would be
 * wrong on one of them.
 */
export default function CategoryBreakdown({ rows, total, title = 'Where it went' }) {
  return (
    <div className="card mb-4 p-4">
      <h2 className="mb-3 text-base font-bold text-ink-900">{title}</h2>

      <ul className="space-y-3">
        {rows.map(([category, amount]) => {
          const share = total > 0 ? Math.round((amount / total) * 100) : 0;

          return (
            <li key={category}>
              <div className="flex items-baseline justify-between gap-3">
                {/* A typed category can be a whole sentence - this pump has one
                    reading "salary of haseeb and pump tea and lunch" - so the
                    name wraps and the figure never does. */}
                <span className="min-w-0 text-sm text-ink-800">{category}</span>
                <span className="tabular shrink-0 text-sm font-semibold text-ink-900">
                  {formatPKR(amount)}
                  <span className="ml-2 font-normal text-ink-500">{share}%</span>
                </span>
              </div>

              <LinearProgress
                variant="determinate"
                value={Math.min(100, share)}
                aria-hidden="true"
                sx={{
                  mt: 0.75,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: 'var(--color-ink-200)',
                  '& .MuiLinearProgress-bar': { borderRadius: 999 },
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
