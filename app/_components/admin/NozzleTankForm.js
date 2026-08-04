'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { setNozzleTank } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * Which tank a nozzle draws from, and where its meter started.
 *
 * Both on one row behind one Save, because they are set together - once, when
 * the pump is first put on the system - and then almost never touched again.
 *
 * Which is exactly why the button reports state rather than sitting there
 * looking identical on all six rows: on a screen where nothing usually needs
 * saving, a row that does need saving should be the one thing that stands out.
 */
export default function NozzleTankForm({ nozzle, tanks }) {
  const [state, formAction] = useActionState(setNozzleTank, null);

  const storedTank = nozzle.tank_id ?? '';
  const storedStart = String(nozzle.starting_reading ?? 0);

  const [tankId, setTankId] = useState(storedTank);
  const [startingReading, setStartingReading] = useState(storedStart);

  // Re-seed once a save lands, so the row shows what was stored rather than
  // what was typed - the same trap DateNav documents on its date box.
  const stored = `${storedTank}|${storedStart}`;
  const seeded = useRef(stored);
  useEffect(() => {
    if (seeded.current === stored) return;
    seeded.current = stored;
    setTankId(storedTank);
    setStartingReading(storedStart);
  }, [stored, storedTank, storedStart]);

  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  const startNumber = Number(startingReading);
  const hasReading =
    startingReading !== '' && Number.isFinite(startNumber) && startNumber >= 0;

  // Compared as numbers, not as text: 14000 and 14000.00 are the same meter
  // reading, and offering to save one as the other is a lie.
  const isDirty =
    tankId !== storedTank || (hasReading && startNumber !== Number(storedStart));

  // One place decides the label and whether it can be pressed, so the two can
  // never disagree.
  const button = !hasReading
    ? { label: 'Enter a reading', blocked: true, className: 'border-red-200 bg-red-50 text-red-700' }
    : isDirty
      ? {
          label: 'Save',
          blocked: false,
          className: 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700',
        }
      : justSaved
        ? { label: 'Saved', blocked: true, className: 'border-brand-300 bg-brand-50 text-brand-800' }
        : { label: 'No changes', blocked: true, className: 'border-ink-200 bg-ink-100 text-ink-400' };

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="nozzle_id" value={nozzle.id} />

      <label className="sr-only" htmlFor={`tank-${nozzle.id}`}>
        Tank for unit {nozzle.unit_number} nozzle {nozzle.nozzle_label}
      </label>
      <select
        id={`tank-${nozzle.id}`}
        name="tank_id"
        value={tankId}
        onChange={(event) => setTankId(event.target.value)}
        className="input w-auto py-1.5 text-sm"
      >
        {tanks.map((tank) => (
          <option key={tank.id} value={tank.id}>
            {tank.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`start-${nozzle.id}`}>
        Starting meter reading for unit {nozzle.unit_number} nozzle {nozzle.nozzle_label}
      </label>
      <NumberInput
        id={`start-${nozzle.id}`}
        name="starting_reading"
        value={startingReading}
        onChange={(event) => setStartingReading(event.target.value)}
        min="0"
        step="0.01"
        aria-invalid={!hasReading}
        className={`input tabular w-32 py-1.5 text-sm ${
          hasReading ? '' : 'border-red-400 focus:border-red-500 focus:ring-red-200'
        }`}
      />

      <SubmitButton
        disabled={button.blocked}
        pendingLabel="Saving…"
        className={`inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5
                    text-xs font-semibold transition
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                    disabled:cursor-not-allowed ${button.className}`}
      >
        {button.label}
      </SubmitButton>

      {/* A failure stays until it is dealt with. A success does not need its own
          line - the button already says "Saved". */}
      {state?.ok === false ? (
        <span className="w-full text-xs text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}
