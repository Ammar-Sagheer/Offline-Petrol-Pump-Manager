'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createBankTransaction } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import Toast from '@/app/_components/ui/Toast';
import { todayISO } from '@/app/_lib/date-helpers';

// helpers.js reaches into request cookies, so a client component cannot import
// its formatter. Same approach as ReadingForm: format inline with Intl.
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const money = (value) => {
  const n = Number(value ?? 0);
  return `${n < 0 ? '-' : ''}Rs ${moneyFormat.format(Math.abs(n))}`;
};

const PAYMENT_CATEGORIES = [
  'Fuel purchase',
  'Salaries',
  'Electricity',
  'Rent',
  'Maintenance',
  'Transport',
  'Tax',
  'Other',
];

/** What an account can be drawn on. An overdrawn one can lend nothing. */
const availableOf = (account) => Math.max(Number(account?.balance ?? 0), 0);

/**
 * Works out who pays what: the chosen account first, then the others in the
 * order they were ticked, each down to what it holds.
 *
 * The database does this same sum again from the real balances, and its answer
 * is the one that gets written. This copy exists so the owner can see the split
 * forming as he types rather than after pressing Save.
 */
function planSplit(amount, primary, covers) {
  const parts = [];
  let remaining = amount;

  for (const account of [primary, ...covers]) {
    if (!account || remaining <= 0) continue;
    const take = Math.min(remaining, availableOf(account));
    if (take > 0) {
      parts.push({ account, take });
      remaining -= take;
    }
  }

  return { parts, shortfall: Math.max(remaining, 0) };
}

/**
 * Money in, or money out.
 *
 * One form with a direction switch rather than two forms, because the fields
 * are otherwise identical and two near-identical forms side by side is how an
 * amount ends up recorded the wrong way round.
 *
 * No account may go negative. A payment bigger than the account it is being
 * paid from is not simply refused, though - that is a real situation, and the
 * answer is to take the rest from another account. Which accounts, and in which
 * order, is the owner's choice, so it is asked rather than assumed.
 */
export default function BankTransactionForm({ accounts }) {
  const formRef = useRef(null);
  const [txnType, setTxnType] = useState('deposit');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  // Ticked accounts, kept in the order they were ticked - that is the order
  // they get drawn on, so it is worth preserving rather than sorting.
  const [coverIds, setCoverIds] = useState([]);

  const [notice, setNotice] = useState(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await createBankTransaction(prevState, formData);
    if (result?.ok) {
      formRef.current?.reset();
      setTxnType('deposit');
      setAccountId(accounts[0]?.id ?? '');
      setAmount('');
      setCoverIds([]);
    }
    return result;
  }, null);

  // The result of a save is worth seeing once. Left in the form it would still
  // be there over the next entry, describing something that is no longer on
  // screen - a split payment confirmation hanging over a fresh deposit.
  useEffect(() => {
    if (state?.ok) setNotice({ message: state.message });
  }, [state]);

  const isDeposit = txnType === 'deposit';
  const primary = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const others = accounts.filter((account) => account.id !== primary?.id);

  const amountNumber = Number(amount);
  const hasAmount = amount !== '' && Number.isFinite(amountNumber) && amountNumber > 0;

  const covers = coverIds
    .map((id) => others.find((account) => account.id === id))
    .filter(Boolean);

  const { parts, shortfall } = hasAmount
    ? planSplit(amountNumber, primary, covers)
    : { parts: [], shortfall: 0 };

  // A tick can also stop being needed without being touched - lower the amount,
  // or switch which account it is paid from, and one that was carrying part of
  // it is suddenly carrying nothing. Anything down to zero unticks itself, so
  // what is ticked is always what is actually paying.
  const contributingIds = parts.map((part) => part.account.id).join(',');
  useEffect(() => {
    if (isDeposit) return;
    const contributing = new Set(contributingIds ? contributingIds.split(',') : []);
    setCoverIds((current) => {
      const next = current.filter((id) => contributing.has(id));
      // Same array back when nothing changed - a new one every render would
      // re-run this effect forever.
      return next.length === current.length ? current : next;
    });
  }, [contributingIds, isDeposit]);

  if (accounts.length === 0) return null;

  const needsCover = !isDeposit && hasAmount && amountNumber > availableOf(primary);
  const blocked = !isDeposit && hasAmount && shortfall > 0;
  const isSplit = parts.length > 1;

  // What the other accounts have to find between them. An account holding at
  // least this much settles it on its own.
  const needed = hasAmount ? Math.max(amountNumber - availableOf(primary), 0) : 0;
  const isCovered = hasAmount && shortfall === 0;

  /**
   * Ticking an account should mean "take it from here", not "add another tick".
   *
   * Left as a plain multi-select, ticking a second account that was not needed
   * left it ticked and contributing nothing - two accounts marked as paying,
   * one of them a no-op. So a tick only stacks when stacking is the only way to
   * reach the amount:
   *
   *   - an account holding enough on its own replaces the selection
   *   - so does any tick made once the amount is already covered - that is a
   *     change of mind about where the money comes from, not an addition
   *   - only while the amount is still short does a tick add to the others
   */
  function toggleCover(id) {
    setCoverIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);

      const account = others.find((other) => other.id === id);
      const settlesItAlone = availableOf(account) >= needed;

      return settlesItAlone || isCovered ? [id] : [...current, id];
    });
  }

  return (
    <form ref={formRef} action={formAction} className="card h-fit space-y-4 p-4">
      <h3 className="text-sm font-bold text-ink-900">Record a transaction</h3>

      <input type="hidden" name="txn_type" value={txnType} />

      {/* Two big targets rather than a dropdown: this is the choice that matters
          most and the one a thumb on a phone gets wrong most easily. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
        <button
          type="button"
          onClick={() => setTxnType('deposit')}
          aria-pressed={isDeposit}
          className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
            isDeposit
              ? 'border-brand-600 bg-brand-50 text-brand-800'
              : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
          }`}
        >
          Money in
        </button>
        <button
          type="button"
          onClick={() => setTxnType('payment')}
          aria-pressed={!isDeposit}
          className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
            !isDeposit
              ? 'border-amber-500 bg-amber-50 text-amber-900'
              : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
          }`}
        >
          Money out
        </button>
      </div>

      <p className="text-sm text-ink-600">
        {isDeposit
          ? 'Cash from the pump paid into the bank.'
          : 'A transfer out of the bank — fuel, salaries, a bill.'}
      </p>

      <div>
        <label className="label" htmlFor="txn_account">
          {isDeposit ? 'Account' : 'Pay from'}
        </label>
        <select
          id="txn_account"
          name="account_id"
          required
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
            // The ticked accounts belonged to the old choice. Keeping them would
            // let the account being paid from also appear as one lending to it.
            setCoverIds([]);
          }}
          className="input"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_label} — {account.bank_name}
            </option>
          ))}
        </select>
        {!isDeposit ? (
          <p className="mt-1 text-sm text-ink-600">
            Holds{' '}
            <span
              className={
                availableOf(primary) > 0 ? 'font-semibold text-ink-700' : 'font-semibold text-red-700'
              }
            >
              {money(primary?.balance ?? 0)}
            </span>
          </p>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="txn_amount">
          Amount
        </label>
        <NumberInput
          id="txn_amount"
          name="amount"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={blocked}
          className={`input-number ${
            blocked ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
          }`}
          placeholder="0"
        />
      </div>

      {/* Only once the amount is actually too big for the chosen account. Asking
          before then would be a question about a problem nobody has. */}
      {needsCover ? (
        <div
          className={`rounded-lg border px-3 py-3 ${
            blocked ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p className="text-xs font-semibold text-ink-900">
            More than {primary?.account_label} holds
          </p>
          <p className="mt-1 text-xs text-ink-600">
            No account is allowed to go below zero. Take the rest from:
          </p>

          {others.length === 0 ? (
            <p className="mt-2 text-xs font-semibold text-red-700">
              There is no other account to take it from. Record the deposit that covers it first,
              or lower the amount.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {others.map((account) => {
                const ticked = coverIds.includes(account.id);
                const empty = availableOf(account) <= 0;
                const settlesItAlone = !empty && availableOf(account) >= needed;
                return (
                  <li key={account.id}>
                    <label
                      className={`flex items-center gap-2 text-xs ${
                        empty ? 'text-ink-400' : 'text-ink-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="cover_account_ids"
                        value={account.id}
                        checked={ticked}
                        disabled={empty}
                        onChange={() => toggleCover(account.id)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600
                                   focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed"
                      />
                      <span className="font-medium">{account.account_label}</span>
                      {/* Says which ones make the choice a straight swap rather
                          than something that has to be added up. */}
                      {settlesItAlone ? (
                        <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand-800">
                          covers it
                        </span>
                      ) : null}
                      <span className="tabular ml-auto">
                        {empty ? 'nothing to lend' : `${money(account.balance)} available`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {/* What will actually be written, in the order it will be taken. */}
          {parts.length > 0 ? (
            <dl className="mt-3 space-y-1 border-t border-ink-200/70 pt-2 text-xs">
              {parts.map(({ account, take }) => (
                <div key={account.id} className="flex justify-between gap-3">
                  <dt className="text-ink-600">{account.account_label}</dt>
                  <dd className="tabular font-semibold text-ink-900">{money(take)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {shortfall > 0 ? (
            <p className="mt-2 text-xs font-semibold text-red-700">
              {money(shortfall)} still not covered.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="txn_date">
          Date
        </label>
        <input
          id="txn_date"
          name="txn_date"
          type="date"
          required
          defaultValue={todayISO()}
          className="input"
        />
      </div>

      {/* A category describes a payment. On a deposit it would say nothing, so
          it is not asked for. */}
      {!isDeposit ? (
        <div>
          <label className="label" htmlFor="txn_category">
            What for
          </label>
          <input
            id="txn_category"
            name="category"
            type="text"
            list="bank-payment-categories"
            className="input"
            placeholder="e.g. Fuel purchase"
          />
          <datalist id="bank-payment-categories">
            {PAYMENT_CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="txn_note">
          Note <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input id="txn_note" name="note" type="text" className="input" />
      </div>

      {/* A failure stays where it happened, until it is dealt with. A success
          leaves as a toast. */}
      <FormMessage state={state?.ok === false ? state : null} />

      <SubmitButton
        disabled={blocked}
        className={
          blocked
            ? `inline-flex w-full items-center justify-center rounded-lg border border-red-200
               bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed`
            : isDeposit
              ? 'btn-primary w-full'
              : 'btn-secondary w-full'
        }
      >
        {blocked
          ? `${money(shortfall)} still not covered`
          : isDeposit
            ? 'Record money in'
            : isSplit
              ? `Record money out from ${parts.length} accounts`
              : 'Record money out'}
      </SubmitButton>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </form>
  );
}
