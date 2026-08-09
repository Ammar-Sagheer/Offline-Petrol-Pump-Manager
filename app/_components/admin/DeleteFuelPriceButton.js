'use client';

import { useActionState } from 'react';

import { deleteFuelPrice } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

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
  const [state, formAction] = useActionState(deleteFuelPrice, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this rate"
      title="Remove this rate?"
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ price_id: priceId }}
    >
      <p>
        Remove <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
      {/* The part that would otherwise be assumed. It has room to be a full
          sentence here, which it did not have squeezed into a table cell. */}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
        Readings already entered keep the rate they were sold at. Removing this does not correct
        them — clear and re-enter those days too.
      </p>
    </ConfirmAction>
  );
}
