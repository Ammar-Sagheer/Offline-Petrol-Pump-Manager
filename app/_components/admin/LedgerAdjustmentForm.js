'use client';

import { useActionState, useRef, useState } from 'react';

import { recordLedgerAdjustment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const showMoney = (n) => `Rs ${moneyFormat.format(Math.round(n) === 0 ? 0 : n)}`;

/**
 * Owner-only manual ledger entry.
 *
 * Two honest uses: carrying an old balance over from the paper register, and
 * cancelling out an earlier mistake. Kept behind a toggle so it is a deliberate
 * act rather than something anyone stumbles into.
 *
 * WHY THE WORDING CHANGED. The choice used to be "Increases what they owe" and
 * "Reduces what they owe" in a dropdown, and the owner could not tell them
 * apart - two long phrases differing by one word in the middle. Picking the
 * wrong one here does not fail, it silently moves a real balance the wrong
 * way, so this is the one control on the page where being merely accurate is
 * not enough.
 *
 * So: two cards saying what actually happened in the yard, each with an
 * example of when to use it - AND, underneath, the balance this would produce.
 * The figure is what makes the choice checkable. Somebody who misreads both
 * labels will still notice that Rs 3,000 is about to become Rs 8,000 when they
 * meant to clear the account.
 */
export default function LedgerAdjustmentForm({ customerId, balance = 0 }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('');
  const [amount, setAmount] = useState('');

  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await recordLedgerAdjustment(prevState, formData);
    if (result?.ok) {
      formRef.current?.reset();
      setDirection('');
      setAmount('');
    }
    return result;
  }, null);

  const today = todayISO();

  const current = Number(balance ?? 0);
  const typed = Number(amount);
  const hasAmount = Number.isFinite(typed) && typed > 0;
  // Whole rupees, matching the ledger itself - see roundRupees in helpers.js.
  const change = hasAmount ? Math.round(typed) : 0;
  const after =
    direction === 'owes' ? current + change : direction === 'in_credit' ? current - change : null;

  const showPreview = direction !== '' && hasAmount;

  if (!isOpen) {
    return (
      <Button variant="secondary" fullWidth type="button" onClick={() => setIsOpen(true)}>
        Make a manual adjustment
      </Button>
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
      {/* The action still speaks debit/credit; the translation happens here so
          the two words never reach the screen. */}
      <input
        type="hidden"
        name="entry_type"
        value={direction === 'owes' ? 'debit' : direction === 'in_credit' ? 'credit' : ''}
      />

      <fieldset>
        <legend className="label">Which way does this go?</legend>
        <BalanceDirection
          name="direction"
          value={direction}
          onChange={setDirection}
          options={[
            {
              value: 'owes',
              title: 'They owe more',
              // Same two register words as the New customer form, so the owner
              // is choosing between the terms he already writes by hand.
              urdu: 'بنام',
              detail: 'Fuel from the old register, or something that was missed',
            },
            {
              value: 'in_credit',
              title: 'They owe less',
              urdu: 'جمع',
              detail: 'Money already paid that is not on this list, or an amount written off',
            },
          ]}
        />
      </fieldset>

      <div>
        <label className="label" htmlFor="adjustment_amount">
          Amount
        </label>
        <NumberInput
          id="adjustment_amount"
          name="amount"
          step="1"
          min="1"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="input-number"
          placeholder="0"
        />
      </div>

      {/* The check that matters. Stated as the sentence the owner would say. */}
      {showPreview ? (
        <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700">
          {showMoney(current)} <span aria-hidden="true">→</span>{' '}
          <span className="whitespace-nowrap font-bold text-ink-900">{showMoney(after)}</span>
          <span className="mt-0.5 block text-xs text-ink-600">
            {after > 0
              ? `${showMoney(after)} owed to the pump after this.`
              : after < 0
                ? `The pump would owe them ${showMoney(Math.abs(after))} after this.`
                : 'The account would be settled after this.'}
          </span>
        </p>
      ) : null}

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
        <p className="mt-1 text-sm text-ink-600">
          Required, and permanent. This entry can never be edited or removed.
        </p>
      </div>

      <FormMessage state={state} />

      <SubmitButton fullWidth  disabled={!direction}>
        Post adjustment
      </SubmitButton>
    </form>
  );
}
