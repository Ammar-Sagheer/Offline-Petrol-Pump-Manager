'use client';

import { useActionState, useState } from 'react';

import { deleteBankTransaction } from '@/app/_lib/actions';

/**
 * Removes one transaction. Owner only.
 *
 * Confirms inline like the expense delete: an amount typed in the wrong
 * direction moves the balance twice over, so this gets used - but not from a
 * stray tap on a phone.
 */
export default function DeleteBankTransactionButton({ transactionId, summary }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(deleteBankTransaction, null);

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
      <input type="hidden" name="transaction_id" value={transactionId} />
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
