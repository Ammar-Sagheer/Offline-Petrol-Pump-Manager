'use client';

import { useActionState, useState } from 'react';

import { deleteReplacedSnapshot } from '@/app/_lib/actions';

/**
 * Removes the "replaced" snapshot - the pre-restore db-data/config.json the
 * previous restore moved aside rather than deleted (performRestore() in
 * electron/main.js). Nothing else cleans this up; the owner decides when
 * it is safe to let it go, same reasoning DeleteFuelPriceButton follows.
 */
export default function DeleteReplacedSnapshotButton({ summary }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(deleteReplacedSnapshot, null);

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
    <form action={formAction} className="flex flex-col items-end gap-1 text-right">
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
      {state?.ok === false ? <span className="text-xs text-red-700">{state.message}</span> : null}
    </form>
  );
}
