'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { setNozzleWiring } from '@/app/_lib/actions';
import Dialog from '@/app/_components/ui/Dialog';
import FormMessage from '@/app/_components/ui/FormMessage';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * Which tank each nozzle draws from, and where its meter started - behind a
 * dialog for the same reason a bank account is: set once when the pump goes
 * onto the system and then almost never touched again.
 *
 * ONE form for all six rows, not one per row. Describing how the place is
 * plumbed is a single job, and six Save buttons made it look like six - with
 * the row you had just edited indistinguishable from the five you had not. One
 * button also means one write, which is what stops half the nozzles ending up
 * pointing at the new tanks and half at the old.
 */
export default function NozzleSettingsButton({ nozzles, tanks }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it; reopening starts clean
  // rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(setNozzleWiring, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
        className="btn-secondary"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ✎
        </span>
        Edit nozzle wiring
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Nozzle wiring"
        subtitle={
          <span className="text-sm text-ink-600">
            Which tank each nozzle draws from, and where its meter started
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-4"
        >
          <p className="text-sm text-ink-600">
            The tank decides which stock a sale comes out of. The starting reading is only used
            until that nozzle has its first day entered — after that each day opens at the
            previous day’s closing.
          </p>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Set the starting readings <span className="font-semibold">before</span> entering your
            first day. Leaving them at 0 on a pump that has been trading makes that first day
            count the meter’s whole lifetime as one day of sales.
          </p>

          <div className="card table-scroll">
            <table className="w-full min-w-[34rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Unit</th>
                  <th className="th">Nozzle</th>
                  <th className="th">Draws from</th>
                  <th className="th">Meter starts at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {nozzles.map((nozzle) => (
                  <tr key={nozzle.id}>
                    <td className="td font-medium">Unit {nozzle.unit_number}</td>
                    <td className="td">Nozzle {nozzle.nozzle_label}</td>
                    <td className="td">
                      {/* The three fields repeat their names down the table.
                          A form serialises repeated names in markup order, so
                          the action can line the three lists up by index. */}
                      <input type="hidden" name="nozzle_id" value={nozzle.id} />
                      <label className="sr-only" htmlFor={`tank-${nozzle.id}`}>
                        Tank for unit {nozzle.unit_number} nozzle {nozzle.nozzle_label}
                      </label>
                      <select
                        id={`tank-${nozzle.id}`}
                        name="tank_id"
                        defaultValue={nozzle.tank_id ?? ''}
                        className="input w-auto py-1.5 text-sm"
                      >
                        {tanks.map((tank) => (
                          <option key={tank.id} value={tank.id}>
                            {tank.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td">
                      <label className="sr-only" htmlFor={`start-${nozzle.id}`}>
                        Starting meter reading for unit {nozzle.unit_number} nozzle{' '}
                        {nozzle.nozzle_label}
                      </label>
                      <NumberInput
                        id={`start-${nozzle.id}`}
                        name="starting_reading"
                        defaultValue={nozzle.starting_reading ?? 0}
                        min="0"
                        step="0.01"
                        required
                        className="input tabular w-32 py-1.5 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A failure stays put; a success has already closed the dialog. */}
          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="btn-primary flex-1" pendingLabel="Saving…">
              Save wiring
            </SubmitButton>
            <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
