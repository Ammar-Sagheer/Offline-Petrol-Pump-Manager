'use client';

import { useActionState, useRef, useState } from 'react';

import { recordLedgerAdjustment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * Owner-only manual ledger entry.
 *
 * Two honest uses: carrying an old balance over from the paper register, and
 * cancelling out an earlier mistake. Kept behind a toggle so it is a deliberate
 * act rather than something anyone stumbles into.
 */
export default function LedgerAdjustmentForm({ customerId }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await recordLedgerAdjustment(prevState, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  const today = todayISO();

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)} className="btn-secondary w-full">
        Make a manual adjustment
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-900">Manual adjustment</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          Cancel
        </button>
      </div>

      <input type="hidden" name="customer_id" value={customerId} />

      <div>
        <label className="label" htmlFor="entry_type">
          What does this do?
        </label>
        <select id="entry_type" name="entry_type" required defaultValue="" className="input">
          <option value="" disabled>
            Choose…
          </option>
          <option value="debit">Increases what they owe</option>
          <option value="credit">Reduces what they owe</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="adjustment_amount">
          Amount
        </label>
        <NumberInput
          id="adjustment_amount"
          name="amount"
          step="0.01"
          min="0.01"
          required
          className="input-number"
          placeholder="0"
        />
      </div>

      <div>
        <label className="label" htmlFor="adjustment_date">
          Date
        </label>
        <input
          id="adjustment_date"
          name="entry_date"
          type="date"
          required
          defaultValue={today}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="adjustment_note">
          Reason
        </label>
        <input
          id="adjustment_note"
          name="note"
          type="text"
          required
          className="input"
          placeholder="e.g. opening balance from the old register"
        />
        <p className="mt-1 text-xs text-ink-500">
          Required, and permanent. This entry can never be edited or removed.
        </p>
      </div>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full">Post adjustment</SubmitButton>
    </form>
  );
}
