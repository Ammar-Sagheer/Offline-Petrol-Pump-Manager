'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createStockCheck, deleteStockCheck } from '@/app/_lib/actions';
import { shiftISODate, formatDate } from '@/app/_lib/date-helpers';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import Toast from '@/app/_components/ui/Toast';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { fuelColor } from '@/app/_lib/fuel-colors';

const litreFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const showLitres = (n) => `${litreFormat.format(n || 0)} L`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/*
 * The whole card wears its fuel's colour, not just a badge.
 *
 * Two cards side by side, identical but for a name, and the figures typed into
 * them are four-digit numbers that look alike - so petrol's reading going into
 * diesel's box is an easy slip and an expensive one, because a dip is the
 * baseline every later day is measured from.
 *
 * The colours themselves, and the reasoning behind the dark/light pairing, live
 * in `app/_lib/fuel-colors.js` - one definition shared with the badges, the
 * dashboard cards and the charts. Here the band and the border take them; the
 * BODY STAYS WHITE so the figures keep full contrast on a tablet in poor light.
 *
 * Colour is not the only cue and must not be. The tank name is large and bold
 * in the header, and the dip box's own label names the tank again - so the card
 * still reads correctly for anyone who cannot use the colours at all. The
 * FuelBadge that used to sit in this header is gone: on a band that is already
 * the fuel's colour, beside a name that already says "Petrol Tank", it said a
 * third time what had been said twice.
 */

/*
 * A dip is a MOMENT, not a day, and which day it judges depends on when the rod
 * went in.
 *
 * This pump dips first thing in the morning, before the pumps are switched on,
 * so a dip taken on the 11th measures the tank as it stood at the close of the
 * 10th - and has to be compared against the 10th's books. Recording it against
 * the 11th, as the app did until migration 039, compared it against a book
 * figure that still had the 10th's fuel in it and reported a whole day's sales
 * as a loss, every single day.
 *
 * Morning is the default because it is the pump's routine. Both options are
 * legal and only the person holding the rod knows which is right, so this
 * follows the rule in docs/UI_CONVENTIONS.md for exactly that shape of control:
 * name the choice in plain words, then SHOW THE CONSEQUENCE - the day it closes
 * and the book figure that produces - before it is committed.
 */
const TIMINGS = [
  {
    value: 'morning',
    title: 'Morning — before the pumps opened',
    detail: 'The usual one. It closes yesterday, whose readings you are entering now.',
  },
  {
    value: 'evening',
    title: 'Evening — after the pumps closed',
    detail: 'Only if the rod went in at the end of the day, after the last sale.',
  },
];

export default function StockCheckForm({
  tank,
  date,
  existingCheck,
  earliestBooksDate = null,
  openingStock = null,
  canManage = false,
}) {
  const [state, formAction] = useActionState(createStockCheck, null);
  const [clearState, clearAction] = useActionState(deleteStockCheck, null);
  const [dip, setDip] = useState('');
  const [taken, setTaken] = useState('morning');
  const [notice, setNotice] = useState(null);
  const formRef = useRef(null);

  /*
   * Carry the confirmation out of the form and empty the box behind it.
   *
   * Both halves matter, and skipping them caused a real near-miss. This page is
   * date-driven, so stepping to the next day is a client-side navigation that
   * does NOT remount this component - the typed reading and the "Saved…" line
   * both survived it. The next morning's card opened with YESTERDAY'S DIP
   * already in the box, one tap from being saved again as today's measurement,
   * under a green message describing a different day.
   *
   * `Toast` exists for precisely this and says so in its own comment; this form
   * was one of the last that had not adopted it. Failures deliberately stay
   * inline via <FormMessage> - an error has to survive long enough to act on.
   */
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setNotice({ message: state.message });
      formRef.current?.reset();
      setDip('');
      setTaken('morning');
    }
  }, [state]);

  // A different day is a different measurement. Belt to the effect's braces:
  // if a save is ever missed, the box still empties when the date changes.
  useEffect(() => {
    setDip('');
    setTaken('morning');
  }, [date]);

  // Clearing a dip confirms the same way. ConfirmAction closes its own dialog
  // on success, so without this the only trace of it would be the row vanishing.
  const handledClear = useRef(clearState);
  useEffect(() => {
    if (clearState === handledClear.current) return;
    handledClear.current = clearState;
    if (clearState?.ok) setNotice({ message: clearState.message });
  }, [clearState]);

  // The day this dip closes, and so the books it is judged against.
  const closesDate = taken === 'morning' ? shiftISODate(date, -1) : date;

  /*
   * Once a dip is recorded, its OWN stored figures are what the card shows -
   * not a live recomputation for whichever timing the toggle happens to be
   * sitting on. They cannot go stale: migration 039 rebuilds expected_stock
   * from history whenever anything behind it moves.
   */
  const shownClosesDate = existingCheck
    ? (existingCheck.books_date ?? shiftISODate(date, -1))
    : closesDate;
  const expected = existingCheck
    ? Number(existingCheck.expected_stock ?? 0)
    : Number((taken === 'morning' ? tank.expected_if_morning : tank.expected_if_evening) ?? 0);

  /*
   * A dip with no dip behind it is measured against the tank's OPENING STOCK
   * from Settings, because there is nothing else to measure it against. That
   * makes any difference a disagreement between two typed figures, not fuel
   * that appeared or vanished - so it must not be dressed up as a gain.
   *
   * This is not hypothetical: the pump's first dip read 5,556 L against an
   * opening of 854 L and the page announced "Gain of 4,702 L" in green. The two
   * tanks' figures had been entered into each other's cards.
   */
  const isFirstDip = existingCheck
    ? !earliestBooksDate || (existingCheck.books_date ?? '') <= earliestBooksDate
    : !earliestBooksDate || closesDate <= earliestBooksDate;

  const dipValue = dip === '' ? null : Number(dip);
  const hasDip = dipValue !== null && Number.isFinite(dipValue);
  const difference = hasDip ? round2(dipValue - expected) : null;

  const openingNote = isFirstDip ? (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
      This is the first dip for this tank, so there is no earlier measurement behind it — it is
      worked out from the <strong>opening stock</strong> of {showLitres(openingStock ?? expected)}{' '}
      set under Settings → Tanks. That figure was typed, not measured, so if it is wrong (or on the
      wrong tank) the difference below is not fuel. Check it before reading this as a gain or a
      loss.
    </p>
  ) : null;

  const capacity = Number(tank.capacity_litres ?? 0);
  const fillPercent = capacity ? Math.min(100, Math.max(0, (expected / capacity) * 100)) : 0;

  // More fuel on the books than the tank can physically hold, or less than
  // nothing in it. Either way the books are wrong, not the tank.
  const overCapacity = capacity > 0 && expected > capacity;
  const belowZero = expected < 0;

  const color = fuelColor(tank.fuel_type);

  /*
   * No coloured ring any more - the header band already IS the fuel's colour,
   * and putting a matching outline around the whole card doubled up on that
   * (and read as a picture-frame, not a raised card). `shadow-xl` instead:
   * `.card` gives every card `shadow-md` now, and this is the one surface in
   * the app where a wrong figure corrupts every later day's numbers, so it
   * gets the strongest lift on the page.
   */
  return (
    <section className="card overflow-hidden shadow-xl">
      {/* The name is text-base, not the old text-sm: it is the thing that says
          which tank you are typing into, and it was the smallest text on the
          card. */}
      <header
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 ${color.solid}`}
      >
        <h2 className={`text-base font-bold`}>{tank.name}</h2>
        <span className={`text-sm font-medium ${color.solidMuted}`}>
          Capacity {litreFormat.format(tank.capacity_litres)} L
        </span>
      </header>

      <div className="p-4">
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="figure-label">Expected in tank</span>
            {/* nowrap: at a phone's width this figure was breaking between the
              number and its unit, leaving a bare "L" on the next line. */}
            <span
              className={`tabular whitespace-nowrap text-lg font-bold ${
                overCapacity || belowZero ? 'text-red-700' : 'text-ink-900'
              }`}
            >
              {showLitres(expected)}
            </span>
          </div>
          {/* Which day's books that is. Its own line rather than part of the
            label above, so the date can never squeeze the figure. */}
          <p className="text-sm text-ink-600">at the close of {formatDate(shownClosesDate)}</p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200"
            role="img"
            aria-label={`Tank is about ${Math.round(fillPercent)} percent full`}
          >
            {/* The fill is the FUEL'S colour, from fuel-colors.js. It was a
                hardcoded sky/amber pair that no longer matched anything else on
                the card - the sort of leftover that makes a screen look like
                random colours rather than a scheme. Red still overrides, because
                over-capacity is a warning and outranks identity. */}
            <div
              className={overCapacity ? 'h-full rounded-full bg-red-500' : 'h-full rounded-full'}
              style={{
                width: `${fillPercent}%`,
                backgroundColor: overCapacity ? undefined : color.hex,
              }}
            />
          </div>

          {openingNote}

          {overCapacity ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              The books show {showLitres(expected)} in a tank that only holds{' '}
              {litreFormat.format(capacity)} L — {showLitres(expected - capacity)} too much. A
              delivery quantity was probably mistyped. Check Purchases before recording a dip, or
              the loss below will be nonsense.
            </p>
          ) : null}

          {belowZero ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              The books show less than nothing in this tank. A delivery is probably missing, or the
              opening stock was never set under Settings.
            </p>
          ) : null}
        </div>

        {existingCheck ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-ink-600">
                  A dip was already recorded for this date:{' '}
                  <span className="tabular font-semibold text-ink-900">
                    {showLitres(existingCheck.actual_dip_reading)}
                  </span>
                </p>
                <p className="text-ink-600">
                  Taken {existingCheck.taken ?? 'morning'} of {formatDate(date)}.
                </p>
                <p
                  className={[
                    'tabular mt-1 font-bold',
                    Number(existingCheck.gain_loss) === 0
                      ? 'text-ink-700'
                      : isFirstDip
                        ? 'text-amber-900'
                        : Number(existingCheck.gain_loss) > 0
                          ? 'text-brand-700'
                          : 'text-red-700',
                  ].join(' ')}
                >
                  {Number(existingCheck.gain_loss) === 0
                    ? isFirstDip
                      ? 'Matches the opening stock exactly'
                      : 'Matches the books exactly'
                    : isFirstDip
                      ? `${showLitres(Math.abs(Number(existingCheck.gain_loss)))} away from the opening stock`
                      : Number(existingCheck.gain_loss) > 0
                        ? `Gain of ${showLitres(existingCheck.gain_loss)}`
                        : `Loss of ${showLitres(Math.abs(Number(existingCheck.gain_loss)))}`}
                </p>
              </div>

              {/* A mistyped rod reading has to be correctable, and a dip is the
                baseline every later figure is built on - so a wrong one is
                wrong for every day after it, not just its own. Cleared and
                re-entered rather than edited, the same as a purchase. */}
              {canManage ? (
                <ConfirmAction
                  triggerLabel={`Clear the ${tank.name} dip`}
                  title="Clear this dip?"
                  confirmLabel="Clear dip"
                  pendingLabel="Clearing…"
                  action={clearAction}
                  state={clearState}
                  hidden={{ check_id: existingCheck.id }}
                >
                  <p>
                    The {showLitres(existingCheck.actual_dip_reading)} measured on{' '}
                    {formatDate(date)} will be removed, and you can record the corrected reading
                    straight away.
                  </p>
                  <p>
                    Every later dip is measured from this one, so their gain and loss figures will
                    be worked out again from whatever is left behind it.
                  </p>
                  {clearState?.ok === false ? <FormMessage state={clearState} /> : null}
                </ConfirmAction>
              ) : null}
            </div>
          </div>
        ) : (
          <form ref={formRef} action={formAction} className="space-y-3">
            <input type="hidden" name="tank_id" value={tank.id} />
            <input type="hidden" name="check_date" value={date} />

            <div>
              <span className="label block">When was the rod put in?</span>
              {/* The chosen option wears the TANK'S colour, not the app's green.
                A green card inside a yellow-banded diesel card reads as a
                third, unrelated hue dropped into the middle of it. */}
              <BalanceDirection
                name="taken"
                value={taken}
                onChange={setTaken}
                options={TIMINGS}
                activeClass={color.selected}
              />
              <p className="mt-1 text-sm text-ink-600">
                A dip taken on the morning of {formatDate(date)} measures what was left at the end
                of {formatDate(shiftISODate(date, -1))}, so that is the day it is checked against.
              </p>
            </div>

            <div>
              {/* The fuel is named in the label, not left to the card's colour.
                Two four-digit readings typed into the wrong boxes look
                perfectly plausible, and nothing downstream can catch it - so
                the box itself says which tank it belongs to, for anyone who
                cannot separate sky from amber. */}
              <label className="label" htmlFor={`dip-${tank.id}`}>
                <span className={`font-bold ${color.onWhite}`}>{tank.name}</span> dip reading{' '}
                <span className="font-semibold text-ink-900">in litres</span>
              </label>
              <NumberInput
                id={`dip-${tank.id}`}
                name="actual_dip_reading"
                step="0.01"
                min="0"
                required
                value={dip}
                onChange={(event) => setDip(event.target.value)}
                className="input-number"
                placeholder="0.00"
                aria-describedby={`dip-help-${tank.id}`}
              />
              <p id={`dip-help-${tank.id}`} className="mt-1 text-sm text-ink-600">
                The dip rod reads a depth — convert it to litres on the tank chart first, then enter
                that figure here.
              </p>
            </div>

            {difference !== null ? (
              <p
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold',
                  difference === 0
                    ? 'bg-ink-100 text-ink-700'
                    : difference > 0
                      ? 'bg-brand-50 text-brand-800'
                      : 'bg-red-50 text-red-800',
                ].join(' ')}
              >
                {difference === 0
                  ? isFirstDip
                    ? 'Matches the opening stock exactly.'
                    : 'Matches the books exactly.'
                  : isFirstDip
                    ? `${showLitres(Math.abs(difference))} away from the opening stock.`
                    : difference > 0
                      ? `Gain of ${showLitres(difference)} against the books.`
                      : `Loss of ${showLitres(Math.abs(difference))} against the books.`}
                <span className="mt-0.5 block text-xs font-normal">
                  For {formatDate(closesDate)}.
                </span>
              </p>
            ) : null}

            <div>
              <label className="label" htmlFor={`note-${tank.id}`}>
                Note <span className="font-normal text-ink-500">(optional)</span>
              </label>
              <input
                id={`note-${tank.id}`}
                name="note"
                type="text"
                className="input"
                placeholder="e.g. measured after the evening delivery"
              />
            </div>

            {/* Errors only. A success goes to the toast above, so it cannot sit
              here describing a day that is no longer on screen. */}
            {state?.ok === false ? <FormMessage state={state} /> : null}

            <SubmitButton fullWidth >Record dip</SubmitButton>
          </form>
        )}
      </div>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}
