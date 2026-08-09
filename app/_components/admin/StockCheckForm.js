'use client';

import { useActionState, useState } from 'react';

import { createStockCheck } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import NumberInput from '@/app/_components/ui/NumberInput';

const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const showLitres = (n) => `${litreFormat.format(n || 0)} L`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function StockCheckForm({ tank, date, existingCheck }) {
  const [state, formAction] = useActionState(createStockCheck, null);
  const [dip, setDip] = useState('');

  const expected = Number(tank.expected_stock ?? 0);
  const dipValue = dip === '' ? null : Number(dip);
  const hasDip = dipValue !== null && Number.isFinite(dipValue);
  const difference = hasDip ? round2(dipValue - expected) : null;

  const capacity = Number(tank.capacity_litres ?? 0);
  const fillPercent = capacity ? Math.min(100, Math.max(0, (expected / capacity) * 100)) : 0;

  // More fuel on the books than the tank can physically hold, or less than
  // nothing in it. Either way the books are wrong, not the tank.
  const overCapacity = capacity > 0 && expected > capacity;
  const belowZero = expected < 0;

  return (
    <section className="card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink-900">{tank.name}</h2>
          <FuelBadge fuelType={tank.fuel_type} />
        </div>
        <span className="text-sm text-ink-600">
          Capacity {litreFormat.format(tank.capacity_litres)} L
        </span>
      </header>

      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <span className="figure-label">
            Expected in tank
          </span>
          <span
            className={`tabular text-lg font-bold ${
              overCapacity || belowZero ? 'text-red-700' : 'text-ink-900'
            }`}
          >
            {showLitres(expected)}
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200"
          role="img"
          aria-label={`Tank is about ${Math.round(fillPercent)} percent full`}
        >
          <div
            className={`h-full rounded-full ${
              overCapacity
                ? 'bg-red-500'
                : tank.fuel_type === 'petrol'
                  ? 'bg-sky-500'
                  : 'bg-amber-500'
            }`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>

        {overCapacity ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            The books show {showLitres(expected)} in a tank that only holds{' '}
            {litreFormat.format(capacity)} L — {showLitres(expected - capacity)} too much. A
            delivery quantity was probably mistyped. Check Purchases before recording a dip, or the
            loss below will be nonsense.
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
          <p className="text-ink-600">
            A dip was already recorded for this date:{' '}
            <span className="tabular font-semibold text-ink-900">
              {showLitres(existingCheck.actual_dip_reading)}
            </span>
          </p>
          <p
            className={[
              'tabular mt-1 font-bold',
              Number(existingCheck.gain_loss) === 0
                ? 'text-ink-700'
                : Number(existingCheck.gain_loss) > 0
                  ? 'text-brand-700'
                  : 'text-red-700',
            ].join(' ')}
          >
            {Number(existingCheck.gain_loss) === 0
              ? 'Matches the books exactly'
              : Number(existingCheck.gain_loss) > 0
                ? `Gain of ${showLitres(existingCheck.gain_loss)}`
                : `Loss of ${showLitres(Math.abs(Number(existingCheck.gain_loss)))}`}
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="tank_id" value={tank.id} />
          <input type="hidden" name="check_date" value={date} />

          <div>
            <label className="label" htmlFor={`dip-${tank.id}`}>
              Measured dip reading{' '}
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
                ? 'Matches the books exactly.'
                : difference > 0
                  ? `Gain of ${showLitres(difference)} against the books.`
                  : `Loss of ${showLitres(Math.abs(difference))} against the books.`}
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

          <FormMessage state={state} />

          <SubmitButton className="btn-primary w-full">Record dip</SubmitButton>
        </form>
      )}
    </section>
  );
}
