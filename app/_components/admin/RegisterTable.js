import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import { formatDate } from '@/app/_lib/helpers';

/**
 * One fuel's Daily Sale & Stock Register - the table this page exists for.
 *
 * It is a SERVER component even though every tag in it is Material UI. MUI's
 * components carry their own `'use client'`, so rendering them from the server
 * is allowed and ships no component code of ours to the browser; the table is
 * static once drawn, so there is nothing for a client component to do. Only
 * `RegisterRange` is `'use client'`, because it genuinely has state.
 *
 * ---------------------------------------------------------------------------
 * THE TABLE IS WIDER THAN THE PAGE, AND THAT IS THE DESIGN PROBLEM
 * ---------------------------------------------------------------------------
 * With the 240px sidebar, a 1152px window leaves this about 880px and a 1024px
 * one about 750px. Ten numeric columns do not fit in either, so the table
 * scrolls inside its own card - which is this app's normal answer for a wide
 * table and is fine for Purchases or the ledger.
 *
 * It was NOT fine here, and the first screenshot showed why: scrolled to its
 * natural start, the columns on screen were opening stock and receipts, and
 * the cumulative block - the reason anybody opens this page, the block the
 * owner circled on his own spreadsheet - was off the right-hand edge at every
 * width including a phone. A table whose point is invisible until you scroll
 * is a table that will be read wrong.
 *
 * Two things fix it, and both are worth copying to the next wide table:
 *
 *   - THE DATE COLUMN IS PINNED LEFT and THE CUMULATIVE BLOCK IS PINNED
 *     RIGHT. Whatever the scroll position, the reader can always see which day
 *     a row is and where the running totals stand; the middle - the working
 *     that gets from one to the other - is what slides. Sticky headers already
 *     do the same job vertically, and `.table-scroll` is what both rely on:
 *     the wrapper has to be the scrolling element.
 *   - TWO COLUMNS THAT WERE ONLY EVER DERIVED CAME OUT, because a scrollable
 *     region clips at its edge and the first screenshot clipped it straight
 *     through a dip reading - "5,219.(" - which reads as a broken number
 *     rather than as more table. Narrowing the table until the clip lands in
 *     the gutter is the fix, and the two cheapest columns were:
 *       · THE DAY'S SALE IN RUPEES. Not part of the stock reconciliation at
 *         all; the fuel cards above carry each fuel's takings for exactly
 *         these days and the profit tiles carry the money.
 *       · TOTAL STOCK. The owner's spreadsheet has it, and it is opening plus
 *         received - the two columns immediately to its left. Deliveries are a
 *         handful a week, so on most rows it was a verbatim copy of Opening.
 *     Both are one addition away from the columns that remain, and neither is
 *     worth the width on a 750px page. If the owner wants Total back, it is
 *     one `<TableCell>`; the clip comes back with it.
 *
 * The pinned columns need FIXED WIDTHS - a sticky offset has to be a number,
 * so `right` on the middle of three pinned columns is the sum of the widths to
 * its right. They are the three constants below; change one and change the
 * offsets with it.
 *
 * ---------------------------------------------------------------------------
 * WHY A TWO-ROW HEADER, AND WHERE THE UNITS ARE
 * ---------------------------------------------------------------------------
 * Ten numeric columns is more than anyone holds in their head, and the
 * spreadsheet this replaces does not ask them to: its columns come in groups -
 * what was in the tank, what went out, what the books say against what the rod
 * says, and the running totals. The grouping row is the one piece of the Excel
 * layout worth copying exactly.
 *
 * UNITS LIVE IN THE HEADER, NOT IN THE CELLS. Every column here is litres, and
 * "4,720.00 L" ten times across is a third more width for a fact the heading
 * states once. The conventions' rule that a figure and its unit must not break
 * apart still holds - it is satisfied by there being no unit in the cell to
 * break away from.
 *
 * EVERY LITRE FIGURE CARRIES TWO DECIMALS, including whole ones. Meter sales
 * genuinely run to the centilitre and dips are usually whole, so left to
 * themselves the column read "5,556", "332.46", "1,033.8" - three different
 * shapes in one column of tabular numerals, which stops the decimal points
 * lining up and is exactly what tabular numerals are for.
 *
 * ---------------------------------------------------------------------------
 * COLOUR, AND WHAT CARRIES THE MEANING
 * ---------------------------------------------------------------------------
 * The cumulative block gets a NEUTRAL grey tint, not a colour. It has to be
 * findable at a glance - but a tint that meant something (green for good,
 * amber for owed) would be claiming a verdict about figures that are as often
 * negative as positive. The tint says "these belong together"; the numbers say
 * how it went.
 *
 * Gain and loss are the app's existing chrome pair, brand-700 and red-700, and
 * COLOUR IS NEVER THE ONLY CUE: every variance carries an explicit + or − in
 * front of it, so the column reads the same in a photocopy, in poor light, or
 * to someone who cannot tell the two hues apart.
 *
 * A DAY WITH NO DIP SHOWS AN EM-DASH, not a zero. Nobody measured the tank, so
 * the variance is unknown - and a zero in that column would say the opposite,
 * that it was measured and came out exact, which is the one thing a rod
 * reading almost never does.
 */

/*
 * The pinned columns' widths, and they are sized by THE NARROWEST SCREEN, not
 * the widest. At 400px the four pinned columns are very nearly the whole
 * table - a phone shows the date and the cumulative block and nothing else -
 * so they have to fit 400px between them or they start covering each other.
 * The first phone screenshot had the cumulative block sitting on top of the
 * date column, which rendered as "01 Aug 202": a truncated year, and the kind
 * of defect that reads as corrupt data rather than as a layout problem.
 *
 * 7 + 6 + 5.5 + 4.25 = 22.75rem = 364px, which leaves room inside 400. Each is
 * still comfortably wider than its longest real value ("01 Aug 2026",
 * "17,503.73", "+213.73", "+1.22%") at this font size.
 *
 * The `right` offsets are running sums of the widths to their right, because a
 * sticky offset has to be a number. Change a width and change the offset under
 * it in the same edit.
 */
const W_DATE = '7rem';
const W_CUM_SALES = '6rem';
const W_CUM_VARIANCE = '5.5rem';
const W_CUM_PCT = '4.25rem';
/* right(%) = 0 · right(variance) = W_CUM_PCT · right(sales) = pct + variance */
const R_CUM_VARIANCE = '4.25rem';
const R_CUM_SALES = '9.75rem';

/** brand-700 for a gain, red-700 for a loss, ink-500 for exactly nothing. */
function toneOf(value) {
  if (value === null || value === undefined) return 'text-ink-500';
  const n = Number(value);
  if (n > 0) return 'text-brand-700';
  if (n < 0) return 'text-red-700';
  return 'text-ink-500';
}

/** Litres, always to two decimals so the column's decimal points line up. */
function litres(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "+55.20" / "−1.43" / "—". The sign is the cue that survives without colour. */
function signed(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  // U+2212 MINUS SIGN, not a hyphen: it is the same width as the plus above it
  // in a tabular-numerals column, so the signs line up down the column.
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${litres(Math.abs(n))}`;
}

/**
 * The totals row's label: "01–07 Aug" for a range, "01 Aug" for a single day.
 *
 * Built by hand rather than from `formatDate` twice, because "01 Aug 2026 –
 * 07 Aug 2026" is more than three times the width of the column it has to sit
 * in and repeats the month and the year for nothing. The year is already on
 * every date above it and in the heading over the whole page.
 *
 * An EN DASH between the two, not a hyphen - it is a range, and the same dash
 * the page's own heading uses.
 */
function rangeLabel(fromDay, toDay) {
  const [, month, day] = String(fromDay).slice(0, 10).split('-');
  const lastDay = String(toDay).slice(0, 10).split('-')[2];
  const monthName = MONTHS[Number(month) - 1] ?? '';
  return day === lastDay ? `${day} ${monthName}` : `${day}–${lastDay} ${monthName}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pct(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

// Shared cell shapes. `sx` rather than Tailwind classes because these are MUI
// TableCells and MUI's own padding would otherwise have to be fought twice.
const numCell = {
  px: 1.25,
  py: 1.25,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  fontSize: '0.9375rem',
};

const groupHead = {
  px: 1.25,
  py: 1,
  textAlign: 'center',
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-600)',
  borderBottom: 0,
};

const colHead = {
  ...numCell,
  py: 1,
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--color-ink-600)',
};

/*
 * The pinned columns.
 *
 * `sx` carries ONLY what varies per column - the offset and the width - and
 * `className` carries the rest. The stacking order and the opaque background
 * live in `.pinned` / `.pinned-left` / `.pinned-right` in globals.css because
 * they have to outrank `.table-scroll thead th`, which `sx` cannot; that block
 * has the full story.
 */
function pinnedLeft(extra = {}) {
  return {
    px: 1.25,
    py: 1.25,
    left: 0,
    width: W_DATE,
    minWidth: W_DATE,
    // Opaque, and set HERE rather than in the stylesheet - see the note beside
    // `.pinned` in globals.css for why that split is the way round it is.
    backgroundColor: '#ffffff',
    whiteSpace: 'nowrap',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-ink-800)',
    ...extra,
  };
}

const PIN_LEFT = 'pinned pinned-left';
const PIN_RIGHT = 'pinned pinned-right';

function pinnedRight({ width, right, extra = {} }) {
  return {
    ...numCell,
    right,
    width,
    minWidth: width,
    maxWidth: width,
    // The cumulative block's own tint. It survives here rather than moving to
    // the stylesheet because it is this table's meaning, not the pattern's -
    // see the note on colour above.
    backgroundColor: 'var(--color-ink-100)',
    ...extra,
  };
}

export default function RegisterTable({ rows = [] }) {
  if (rows.length === 0) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];

  // The footer is the range as one line: the stock it opened with, everything
  // that moved through it, and the stock it closed on. Receipts are summed;
  // opening and closing are the two ENDS of the range, not sums - a total of
  // every day's opening stock would be a number with no meaning.
  const totals = {
    opening: Number(first.opening_stock ?? 0),
    receipts: rows.reduce((sum, row) => sum + Number(row.receipts ?? 0), 0),
    sales: Number(last.cumulative_sales ?? 0),
    closing: last.closing_dip === null ? null : Number(last.closing_dip),
    variance: Number(last.cumulative_variance ?? 0),
    variancePct:
      last.cumulative_variance_pct === null ? null : Number(last.cumulative_variance_pct),
  };

  const topRule = { borderTop: '2px solid var(--color-ink-300)' };

  return (
    <div className="card table-scroll has-pinned-columns">
      <Table size="small" sx={{ minWidth: '52rem' }}>
        <TableHead>
          <TableRow>
            <TableCell
              className={PIN_LEFT}
              sx={pinnedLeft({ ...groupHead, textAlign: 'left', py: 1 })}
            />
            <TableCell sx={groupHead} colSpan={2}>
              In the tank
            </TableCell>
            <TableCell sx={groupHead}>Sold</TableCell>
            <TableCell sx={groupHead} colSpan={2}>
              At the close
            </TableCell>
            {/* "Gain / loss", not "Gain / loss that day". The longer version
                wrapped to two lines and then clipped at the pinned block's
                edge, rendering as "GAIN / LOSS T" over "DAY". The pairing with
                "Running total" beside it already says which is which, and the
                running-total group names its own gain/loss column again. */}
            <TableCell sx={groupHead} colSpan={2}>
              Gain / loss
            </TableCell>
            <TableCell
              className={PIN_RIGHT}
              sx={pinnedRight({
                width: `calc(${W_CUM_SALES} + ${W_CUM_VARIANCE} + ${W_CUM_PCT})`,
                right: 0,
                extra: { ...groupHead, textAlign: 'center' },
              })}
              colSpan={3}
            >
              Running total
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell
              className={PIN_LEFT}
              sx={pinnedLeft({ ...colHead, textAlign: 'left', py: 1 })}
            >
              Date
            </TableCell>
            <TableCell sx={colHead}>Opening</TableCell>
            <TableCell sx={colHead}>Received</TableCell>
            <TableCell sx={colHead}>Litres</TableCell>
            <TableCell sx={colHead}>Should be</TableCell>
            <TableCell sx={colHead}>Dip</TableCell>
            <TableCell sx={colHead}>Litres</TableCell>
            <TableCell sx={colHead}>%</TableCell>
            <TableCell
              className={PIN_RIGHT}
              sx={pinnedRight({
                width: W_CUM_SALES,
                right: R_CUM_SALES,
                extra: colHead,
              })}
            >
              Sold
            </TableCell>
            <TableCell
              className={PIN_RIGHT}
              sx={pinnedRight({
                width: W_CUM_VARIANCE,
                right: R_CUM_VARIANCE,
                extra: colHead,
              })}
            >
              Gain / loss
            </TableCell>
            <TableCell
              className={PIN_RIGHT}
              sx={pinnedRight({ width: W_CUM_PCT, right: 0, extra: colHead })}
            >
              %
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.day}>
              <TableCell className={PIN_LEFT} sx={pinnedLeft()}>
                {formatDate(row.day)}
              </TableCell>
              <TableCell sx={numCell}>{litres(row.opening_stock)}</TableCell>
              {/* Grey and dashed when nothing came in - a delivery is the
                  exception in this column, so the eye should find the days
                  that had one rather than read eleven zeros. */}
              <TableCell sx={{ ...numCell, color: 'var(--color-ink-500)' }}>
                {Number(row.receipts) > 0 ? litres(row.receipts) : '—'}
              </TableCell>
              <TableCell sx={{ ...numCell, fontWeight: 600 }}>{litres(row.meter_sales)}</TableCell>
              <TableCell sx={numCell}>{litres(row.book_stock)}</TableCell>
              <TableCell sx={numCell}>{litres(row.closing_dip)}</TableCell>
              <TableCell
                sx={{ ...numCell, fontWeight: 700 }}
                className={toneOf(row.daily_variance)}
              >
                {signed(row.daily_variance)}
              </TableCell>
              <TableCell sx={numCell} className={toneOf(row.daily_variance_pct)}>
                {pct(row.daily_variance_pct)}
              </TableCell>
              <TableCell
                className={PIN_RIGHT}
                sx={pinnedRight({
                  width: W_CUM_SALES,
                  right: R_CUM_SALES,
                  extra: { fontWeight: 600 },
                })}
              >
                {litres(row.cumulative_sales)}
              </TableCell>
              <TableCell
                className={`${PIN_RIGHT} ${toneOf(row.cumulative_variance)}`}
                sx={pinnedRight({
                  width: W_CUM_VARIANCE,
                  right: R_CUM_VARIANCE,
                  extra: { fontWeight: 700 },
                })}
              >
                {signed(row.cumulative_variance)}
              </TableCell>
              <TableCell
                className={`${PIN_RIGHT} ${toneOf(row.cumulative_variance_pct)}`}
                sx={pinnedRight({ width: W_CUM_PCT, right: 0 })}
              >
                {pct(row.cumulative_variance_pct)}
              </TableCell>
            </TableRow>
          ))}

          {/* The footer repeats the last row's cumulative figures on purpose.
              Over a long range the reader is at the bottom of a scrolled table
              and the answer IS the last row - but only if they know that. A
              labelled total row says it outright.

              IT SAYS WHAT THE ROW IS, AND THEN WHICH DAYS. It said "These
              days" first, and the owner's response to that was "what is these
              days" - the whole verdict on it in four words. One line cannot
              do this job: the reader needs to know both that this is not
              another day, and which days it covers.

              "Summary" rather than "Total", because two of its own cells are
              not totals - opening stock and the dip are the two ENDS of the
              range, and a sum of every day's opening stock would be a figure
              with no meaning. Calling the row a total would promise arithmetic
              it deliberately does not do.

              The dates go underneath in ordinary case, so the two lines do not
              read as one shouted phrase. Both always fall in the same month,
              because the range picker cannot span two, so the month is stated
              once. */}
          <TableRow>
            <TableCell
              className={PIN_LEFT}
              sx={pinnedLeft({
                ...topRule,
                backgroundColor: 'var(--color-ink-50)',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.03em',
              })}
            >
              <span className="block">Summary</span>
              <span className="block font-semibold normal-case tracking-normal text-ink-600">
                {rangeLabel(first.day, last.day)}
              </span>
            </TableCell>
            <TableCell sx={{ ...numCell, ...topRule }}>{litres(totals.opening)}</TableCell>
            <TableCell sx={{ ...numCell, ...topRule, fontWeight: 700 }}>
              {totals.receipts > 0 ? litres(totals.receipts) : '—'}
            </TableCell>
            <TableCell sx={{ ...numCell, ...topRule, fontWeight: 700 }}>
              {litres(totals.sales)}
            </TableCell>
            <TableCell sx={{ ...numCell, ...topRule }} />
            <TableCell sx={{ ...numCell, ...topRule, fontWeight: 700 }}>
              {litres(totals.closing)}
            </TableCell>
            <TableCell sx={{ ...numCell, ...topRule }} />
            <TableCell sx={{ ...numCell, ...topRule }} />
            <TableCell
              className={PIN_RIGHT}
              sx={pinnedRight({
                width: W_CUM_SALES,
                right: R_CUM_SALES,
                extra: { ...topRule, fontWeight: 700 },
              })}
            >
              {litres(totals.sales)}
            </TableCell>
            <TableCell
              className={`${PIN_RIGHT} ${toneOf(totals.variance)}`}
              sx={pinnedRight({
                width: W_CUM_VARIANCE,
                right: R_CUM_VARIANCE,
                extra: { ...topRule, fontWeight: 700 },
              })}
            >
              {signed(totals.variance)}
            </TableCell>
            <TableCell
              className={`${PIN_RIGHT} ${toneOf(totals.variancePct)}`}
              sx={pinnedRight({
                width: W_CUM_PCT,
                right: 0,
                extra: { ...topRule, fontWeight: 700 },
              })}
            >
              {pct(totals.variancePct)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
