'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { updateTank } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import NumberInput from '@/app/_components/ui/NumberInput';

// helpers.js reaches into request cookies, so a client component cannot import
// it. Same approach as ReadingForm: format inline with Intl.
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const litres = (value) => `${litreFormat.format(value)} L`;

export default function TankForm({ tank }) {
  const [state, formAction] = useActionState(updateTank, null);

  // Controlled, because the gauge has to move as the numbers are typed - a
  // capacity you have just overshot is worth seeing before you press Save, not
  // after the server turns it down.
  const [capacity, setCapacity] = useState(String(tank.capacity_litres ?? ''));
  const [opening, setOpening] = useState(String(tank.opening_stock_litres ?? ''));
  const [openingDate, setOpeningDate] = useState(tank.opening_stock_date ?? '');

  const stored = [tank.capacity_litres, tank.opening_stock_litres, tank.opening_stock_date].join('|');

  // Re-seed from the server once a save has landed. Without this the fields go
  // on showing what was typed rather than what was stored - the same trap
  // DateNav documents on its date box.
  const seeded = useRef(stored);
  useEffect(() => {
    if (seeded.current === stored) return;
    seeded.current = stored;
    setCapacity(String(tank.capacity_litres ?? ''));
    setOpening(String(tank.opening_stock_litres ?? ''));
    setOpeningDate(tank.opening_stock_date ?? '');
  }, [stored, tank.capacity_litres, tank.opening_stock_litres, tank.opening_stock_date]);

  // "Saved" is worth showing for a moment and then getting out of the way. The
  // old message sat there for the rest of the session, so both tanks always
  // looked as though something had just happened.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  const capacityNum = Number(capacity);
  const openingNum = Number(opening);
  const hasFigures =
    capacity !== '' && opening !== '' &&
    Number.isFinite(capacityNum) && capacityNum > 0 &&
    Number.isFinite(openingNum) && openingNum >= 0;

  const overBy = hasFigures ? openingNum - capacityNum : 0;
  const isOver = overBy > 0;
  const filledPercent = hasFigures ? (openingNum / capacityNum) * 100 : 0;
  const isNearlyFull = !isOver && filledPercent >= 90;

  // The two figures compare as numbers, not as text: 25000 and 25000.00 are the
  // same tank, and offering to save one as the other is a lie.
  const isDirty =
    (hasFigures && capacityNum !== Number(tank.capacity_litres)) ||
    (hasFigures && openingNum !== Number(tank.opening_stock_litres)) ||
    openingDate !== (tank.opening_stock_date ?? '');

  // One place decides what the button says and whether it can be pressed, so
  // the label and the state can never disagree.
  const button = isOver
    ? {
        label: 'Opening stock is over capacity',
        blocked: true,
        // Muted enough to read as unavailable, dark enough to actually read -
        // this is the one blocked state that has something to say.
        className: 'border-red-200 bg-red-50 text-red-700',
      }
    : isDirty
      ? { label: 'Save tank', blocked: false, className: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' }
      : justSaved
        ? { label: 'Saved', blocked: true, className: 'border-brand-300 bg-brand-50 text-brand-800' }
        : { label: 'No changes to save', blocked: true, className: 'border-ink-200 bg-ink-100 text-ink-400' };

  const tone = isOver
    ? { bar: 'bg-red-500', text: 'text-red-700' }
    : isNearlyFull
      ? { bar: 'bg-amber-500', text: 'text-amber-800' }
      : { bar: 'bg-brand-600', text: 'text-ink-600' };

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">{tank.name}</h3>
        <FuelBadge fuelType={tank.fuel_type} />
      </div>

      <input type="hidden" name="tank_id" value={tank.id} />

      <div>
        <label className="label" htmlFor={`capacity-${tank.id}`}>
          Capacity (litres)
        </label>
        <NumberInput
          id={`capacity-${tank.id}`}
          name="capacity_litres"
          step="0.01"
          min="1"
          required
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="input-number"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`opening-${tank.id}`}>
            Opening stock
          </label>
          <NumberInput
            id={`opening-${tank.id}`}
            name="opening_stock_litres"
            step="0.01"
            min="0"
            required
            value={opening}
            onChange={(event) => setOpening(event.target.value)}
            aria-invalid={isOver}
            aria-describedby={`gauge-${tank.id}`}
            className={`input-number ${
              isOver ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
            }`}
          />
        </div>
        <div>
          <label className="label" htmlFor={`opening-date-${tank.id}`}>
            From
          </label>
          <input
            id={`opening-date-${tank.id}`}
            name="opening_stock_date"
            type="date"
            required
            value={openingDate}
            onChange={(event) => setOpeningDate(event.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* How full the tank would be. A number typed into a box gives no sense of
          scale; a bar that runs out of room does, and the moment it turns red
          the reason is on screen rather than one save away. */}
      <div id={`gauge-${tank.id}`}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-ink-500">Opening stock against capacity</span>
          <span className={`tabular text-xs font-bold ${tone.text}`}>
            {hasFigures ? `${Math.round(filledPercent)}%` : '—'}
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-ink-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
            style={{ width: `${Math.min(filledPercent, 100)}%` }}
          />
        </div>

        <p className={`mt-1.5 text-xs ${isOver ? 'font-semibold text-red-700' : 'text-ink-500'}`}>
          {!hasFigures
            ? 'Enter a capacity and an opening stock.'
            : isOver
              ? `${litres(overBy)} more than this tank holds. Lower the opening stock, or raise the capacity if the tank really is bigger.`
              : `${litres(openingNum)} in a ${litres(capacityNum)} tank · ${litres(capacityNum - openingNum)} free`}
        </p>
      </div>

      <p className="text-xs text-ink-500">
        Opening stock is only the starting point before the first dip is recorded. Once a physical
        dip exists, that measured figure becomes the baseline instead.
      </p>

      {/* A failure stays up until it is dealt with. A success does not need to:
          the button says "Saved" and the fields show what was stored. */}
      <FormMessage state={state?.ok === false ? state : null} />

      <SubmitButton
        disabled={button.blocked}
        pendingLabel="Saving…"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5
                    text-sm font-semibold transition
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                    disabled:cursor-not-allowed ${button.className}`}
      >
        {button.label}
      </SubmitButton>
    </form>
  );
}
