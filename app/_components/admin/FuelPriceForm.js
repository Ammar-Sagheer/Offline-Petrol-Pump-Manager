'use client';

import { useActionState, useRef } from 'react';

import { setFuelPrice } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

export default function FuelPriceForm({ currentRates }) {
  const formRef = useRef(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await setFuelPrice(prevState, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  const today = todayISO();

  return (
    <form ref={formRef} action={formAction} className="card h-fit space-y-4 p-4">
      <h3 className="text-sm font-bold text-ink-900">Set a new rate</h3>

      <div>
        <label className="label" htmlFor="fuel_type">
          Fuel
        </label>
        <select id="fuel_type" name="fuel_type" required defaultValue="" className="input">
          <option value="" disabled>
            Choose…
          </option>
          <option value="petrol">
            Petrol {currentRates.petrol ? `(now Rs ${currentRates.petrol})` : ''}
          </option>
          <option value="diesel">
            Diesel {currentRates.diesel ? `(now Rs ${currentRates.diesel})` : ''}
          </option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="rate">
          Rate per litre
        </label>
        <NumberInput
          id="rate"
          name="rate"
          step="0.01"
          min="0.01"
          required
          className="input-number"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="label" htmlFor="effective_from">
          In force from
        </label>
        <input
          id="effective_from"
          name="effective_from"
          type="date"
          required
          defaultValue={today}
          className="input"
        />
        <p className="mt-1 text-sm text-ink-600">
          Readings already saved keep the rate they were sold at. Only sales from this date onward
          use the new price.
        </p>
      </div>

      <FormMessage state={state} />

      <SubmitButton fullWidth >Save rate</SubmitButton>
    </form>
  );
}
