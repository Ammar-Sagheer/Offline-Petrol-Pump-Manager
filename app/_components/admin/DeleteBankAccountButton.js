'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { deleteBankAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Dialog from '@/app/_components/ui/Dialog';

/**
 * Removes an account and its transactions.
 *
 * Behind a dialog rather than an inline confirm, because the thing worth
 * reading is not "are you sure" - it is that the transactions go too, and that
 * nothing here can bring them back. The count is named so the sentence is about
 * this account rather than accounts in general.
 */
export default function DeleteBankAccountButton({ accountId, label, transactionCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(deleteBankAccount, null);
  const [showResult, setShowResult] = useState(false);

  // The row disappears on success, so there is nothing left to close - but if
  // the delete fails the dialog has to stay up carrying the reason.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) setIsOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 transition
                   hover:bg-red-50 hover:text-red-700"
      >
        Delete
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Delete ${label}?`}
        subtitle={<span className="text-xs text-ink-500">There is no undo</span>}
      >
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-4"
        >
          <input type="hidden" name="account_id" value={accountId} />

          <p className="text-sm text-ink-700">
            The account goes, and so do the{' '}
            <span className="font-semibold text-ink-900">
              {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
            </span>{' '}
            recorded against it. Its balance stops being counted anywhere on this page.
          </p>

          <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
            If the account is simply closed and you want to keep the record, download this
            month’s report first — the transactions are in it.
          </p>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2">
            <SubmitButton className="btn-danger flex-1" pendingLabel="Deleting…">
              Delete account
            </SubmitButton>
            <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
