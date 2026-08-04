'use client';

import { useActionState, useRef } from 'react';

import { recordPayment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function PaymentForm({ customerId, balance }) {
  const formRef = useRef(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await recordPayment(prevState, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  const today = todayISO();
  const owes = Number(balance) > 0 ? Number(balance) : 0;

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-4">
      <h2 className="text-sm font-bold text-ink-900">Record a payment</h2>

      <input type="hidden" name="customer_id" value={customerId} />

      <div>
        <label className="label" htmlFor="amount">
          Amount received
        </label>
        <NumberInput
          id="amount"
          name="amount"
          step="0.01"
          min="0.01"
          required
          className="input-number"
          placeholder="0"
        />
        {owes > 0 ? (
          <p className="mt-1 text-xs text-ink-500">
            Settling in full would be{' '}
            <span className="tabular font-semibold text-ink-700">
              Rs {moneyFormat.format(owes)}
            </span>
            .
          </p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="entry_date">
          Date
        </label>
        <input
          id="entry_date"
          name="entry_date"
          type="date"
          required
          defaultValue={today}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="note">
          Note <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input
          id="note"
          name="note"
          type="text"
          className="input"
          placeholder="e.g. cash, received by Imran"
        />
      </div>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full">Record payment</SubmitButton>
    </form>
  );
}
