'use client';

import { useActionState, useState } from 'react';

import { deleteFuelPrice } from '@/app/_lib/actions';

/**
 * Owner-only. The only way to correct a mistyped rate.
 *
 * A fuel and a date carry one rate, enforced by a unique constraint, so saving
 * again over the top is refused - which leaves the wrong price standing for the
 * whole day unless it can be removed first.
 *
 * The confirmation says what removing it does NOT do, because that is the part
 * that would otherwise be assumed: readings already entered keep the rate they
 * were sold at, so they stay wrong until they are cleared and re-entered.
 */
export default function DeleteFuelPriceButton({ priceId, summary }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(deleteFuelPrice, null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-red-700 hover:underline"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1 text-right">
      <input type="hidden" name="price_id" value={priceId} />
      <p className="text-xs text-ink-600">Remove {summary}?</p>
      <p className="text-xs text-ink-500">
        Readings already entered keep this rate — clear and re-enter those days too.
      </p>
      <div className="flex gap-2">
        <button type="submit" className="btn-danger px-2 py-1 text-xs">
          Yes, remove
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          Cancel
        </button>
      </div>
      {state?.ok === false ? (
        <span className="text-xs text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}
