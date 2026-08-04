'use client';

import { useActionState, useState } from 'react';

import { deletePurchase } from '@/app/_lib/actions';

/**
 * Owner-only. The way to correct a mistyped delivery: remove it and record it
 * again. Tank stock recalculates itself from history, so the correction flows
 * straight through to the stock and gain/loss figures.
 *
 * Two taps rather than one - deleting a delivery moves the stock figures, so it
 * should not happen from a stray tap on a phone.
 */
export default function DeletePurchaseButton({ purchaseId, summary }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(deletePurchase, null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-red-700 hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <p className="text-xs text-ink-600">Delete {summary}?</p>
      <div className="flex gap-2">
        <button type="submit" className="btn-danger px-2 py-1 text-xs">
          Yes, delete
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
