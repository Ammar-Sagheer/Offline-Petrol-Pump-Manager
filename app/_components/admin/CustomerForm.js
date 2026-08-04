'use client';

import { useActionState } from 'react';

import { createCustomer } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';

export default function CustomerForm() {
  const [state, formAction] = useActionState(createCustomer, null);

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          className="input"
          placeholder="e.g. Bashir Sahib"
        />
      </div>

      <div>
        <label className="label" htmlFor="vehicle_number">
          Vehicle number <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input
          id="vehicle_number"
          name="vehicle_number"
          type="text"
          className="input"
          placeholder="e.g. LEA-1234"
        />
      </div>

      <div>
        <label className="label" htmlFor="phone">
          Phone <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input id="phone" name="phone" type="tel" className="input" placeholder="03xx-xxxxxxx" />
      </div>

      <div>
        <label className="label" htmlFor="credit_limit">
          Credit limit <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <NumberInput
          id="credit_limit"
          name="credit_limit"
          step="0.01"
          min="0"
          className="input-number"
          placeholder="0"
        />
        <p className="mt-1 text-xs text-ink-500">
          Leave blank for no limit. Going over it does not block a sale — the customer is just
          flagged on the list.
        </p>
      </div>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full">Create customer</SubmitButton>
    </form>
  );
}
