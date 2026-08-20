'use client';

import { useActionState, useRef } from 'react';

import { createExpense } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

/*
 * The starting suggestions, for a pump that has not recorded anything yet.
 * Once it has, `used` (the categories actually typed, most-used first) goes in
 * front of these - see getExpenseCategories.
 */
const COMMON_CATEGORIES = [
  'Salaries',
  'Electricity',
  'Rent',
  'Maintenance',
  'Transport',
  'Tax',
  'Other',
];

export default function ExpenseForm({ used = [] }) {
  /*
   * Own categories first, then the stock ones that have not been used yet.
   * A free-text box with no memory is how this pump ended up with most of its
   * spending under "Other" and one category reading "salary of haseeb and pump
   * tea and lunch" - every entry invented its own wording, and the breakdown
   * that reads them was worth correspondingly little.
   */
  const suggestions = [
    ...used,
    ...COMMON_CATEGORIES.filter(
      (category) => !used.some((u) => u.toLowerCase() === category.toLowerCase()),
    ),
  ];

  const formRef = useRef(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await createExpense(prevState, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  const today = todayISO();

  return (
    <form ref={formRef} action={formAction} className="card h-fit space-y-4 p-4">
      <h3 className="text-sm font-bold text-ink-900">Record an expense</h3>

      <div>
        <label className="label" htmlFor="category">
          Category
        </label>
        <input
          id="category"
          name="category"
          type="text"
          required
          list="expense-categories"
          className="input"
          placeholder="e.g. Salaries"
          autoComplete="off"
        />
        <datalist id="expense-categories">
          {suggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="label" htmlFor="expense_amount">
          Amount
        </label>
        <NumberInput
          id="expense_amount"
          name="amount"
          step="0.01"
          min="0.01"
          required
          className="input-number"
          placeholder="0"
        />
      </div>

      <div>
        <label className="label" htmlFor="expense_date">
          Date
        </label>
        <input
          id="expense_date"
          name="expense_date"
          type="date"
          required
          defaultValue={today}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="expense_note">
          Note <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input id="expense_note" name="note" type="text" className="input" />
      </div>

      <FormMessage state={state} />

      <SubmitButton fullWidth >Save expense</SubmitButton>
    </form>
  );
}
