'use client';

import { useActionState, useState } from 'react';

import { resetEverything } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';

/**
 * Empties the books. Only rendered when ALLOW_FULL_RESET is set on the server.
 *
 * Written to look temporary on purpose - it says on its face that it is a
 * testing tool and how to remove it. A destructive button that looks like part
 * of the furniture is one somebody eventually presses by accident.
 *
 * Two things are asked for: the owner's password, and the word RESET typed out.
 * The typing is not security, it is a speed bump - it makes the action
 * deliberate rather than a tap while scrolling.
 */
export default function FullResetPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [state, formAction] = useActionState(resetEverything, null);

  return (
    <section className="card border-red-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-red-800">Empty everything</h3>
          <p className="mt-1 max-w-prose text-xs text-ink-600">
            Removes every reading, credit slip, ledger entry, customer, delivery, stock check,
            expense and fuel rate. Logins, tanks and nozzle starting readings are kept.
          </p>
        </div>
        <Button variant="danger" type="button" onClick={() => setIsOpen(true)} className="shrink-0">
          Empty everything
        </Button>
      </div>

      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span className="font-semibold">This is a testing tool.</span> It only appears because{' '}
        <code className="rounded bg-white px-1 py-0.5 font-mono">ALLOW_FULL_RESET</code> is set on
        the server. Delete that variable in Vercel before the pump goes live and this section
        disappears — there is no undo behind this button.
      </p>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Empty the whole book?"
        subtitle={<span className="text-sm text-ink-600">There is no undo</span>}
      >
        <form action={formAction} className="space-y-4 p-4">
          <p className="text-sm text-ink-700">
            Everything the pump has recorded is deleted: readings, credit slips, the customer
            ledger, customers, deliveries, stock checks, expenses and fuel rates.
          </p>
          <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Kept: the logins, the two tanks and their capacities, and the nozzles with their
            starting meter readings.
          </p>

          <div>
            <label className="label" htmlFor="reset_confirmation">
              Type RESET to confirm
            </label>
            <input
              id="reset_confirmation"
              name="confirmation"
              type="text"
              required
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="input font-mono"
              placeholder="RESET"
            />
          </div>

          <div>
            <label className="label" htmlFor="reset_password">
              Your own password
            </label>
            <input
              id="reset_password"
              name="owner_password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          {state?.ok === false ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
            </p>
          ) : null}
          {state?.ok ? (
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              {state.message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton
              variant="danger" className="flex-1" 
              pendingLabel="Emptying…"
              disabled={confirmation !== 'RESET'}
            >
              Empty everything
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              {state?.ok ? 'Close' : 'Cancel'}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
