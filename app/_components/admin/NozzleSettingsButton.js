'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  setNozzleWiring,
  addNozzle,
  deleteNozzle,
  setNozzleActive,
} from '@/app/_lib/actions';
import Dialog from '@/app/_components/ui/Dialog';
import FormMessage from '@/app/_components/ui/FormMessage';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';

/**
 * Which tank each nozzle draws from, where its meter started, and - new here -
 * adding, removing and restoring nozzles themselves. A real pump's unit and
 * nozzle count varies; the seeded 2 diesel + 4 petrol layout (005) was only
 * ever a starting point for a single machine, not a fact true of every client.
 *
 * ONE form for wiring all existing rows, unchanged from before - see the
 * comment on WiringForm. Add and Remove are deliberately separate forms
 * (siblings of the wiring form, not nested inside it - a <form> may not
 * contain another <form>), because they are each a single, standalone write,
 * not part of the "describe how the place is plumbed" batch.
 */
export default function NozzleSettingsButton({ nozzles, tanks, retiredNozzles }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  return (
    <>
      <Button variant="secondary"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ✎
        </span>
        Edit nozzles
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Nozzles"
        subtitle={
          <span className="text-sm text-ink-600">
            Wiring, and adding or removing nozzles to match how this pump is actually built
          </span>
        }
      >
        <div className="space-y-6 p-4">
          <WiringForm
            nozzles={nozzles}
            tanks={tanks}
            onClose={() => setIsOpen(false)}
            onNotice={setNotice}
            onDeleteRequested={setDeleteTarget}
          />

          <AddNozzleForm tanks={tanks} />

          {retiredNozzles.length > 0 ? <RetiredNozzles nozzles={retiredNozzles} /> : null}
        </div>
      </Dialog>

      <DeleteNozzleDialog nozzle={deleteTarget} onClose={() => setDeleteTarget(null)} />

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

function WiringForm({ nozzles, tanks, onClose, onNotice, onDeleteRequested }) {
  const formRef = useRef(null);
  // A result belongs to the submission that produced it; reopening starts clean
  // rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(setNozzleWiring, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      onClose();
      onNotice({ message: state.message });
    }
  }, [state, onClose, onNotice]);

  if (nozzles.length === 0) {
    return (
      <p className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600">
        No nozzles yet. Add the first one below.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setShowResult(true);
        formAction(formData);
      }}
      className="space-y-4"
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
        <table className="w-full min-w-[38rem]">
          <thead className="border-b border-ink-200 bg-ink-50">
            <tr>
              <th className="th">Unit</th>
              <th className="th">Nozzle</th>
              <th className="th">Draws from</th>
              <th className="th">Meter starts at</th>
              <th className="th">
                <span className="sr-only">Actions</span>
              </th>
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
                <td className="td">
                  {/* type="button": this sits inside the wiring form but must
                      never submit it, only open the (separate) delete dialog. */}
                  <button
                    type="button"
                    onClick={() =>
                      onDeleteRequested({
                        id: nozzle.id,
                        unit_number: nozzle.unit_number,
                        nozzle_label: nozzle.nozzle_label,
                      })
                    }
                    className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-red-50 hover:text-red-700"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A failure stays put; a success has already closed the dialog. */}
      <FormMessage state={showResult ? state : null} />

      <div className="flex gap-2 border-t border-ink-200 pt-4">
        <SubmitButton className="flex-1"  pendingLabel="Saving…">
          Save wiring
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * A new nozzle - its own small form, not a row appended to the wiring table
 * above. That table edits nozzles that already exist; this creates one, and
 * the two are different enough writes (an UPDATE batch versus a single
 * INSERT) that folding them together would make the wiring form's "one
 * button, one write" guarantee untrue.
 */
function AddNozzleForm({ tanks }) {
  const formRef = useRef(null);
  const [state, formAction] = useActionState(addNozzle, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="border-t border-ink-200 pt-4">
      <h3 className="text-sm font-bold text-ink-900">Add a nozzle</h3>
      <p className="mt-0.5 text-sm text-ink-600">
        For a unit or nozzle this pump actually has that is not on the list above.
      </p>

      <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="add-nozzle-unit">
            Unit
          </label>
          <NumberInput
            id="add-nozzle-unit"
            name="unit_number"
            min="1"
            step="1"
            required
            className="input tabular"
          />
        </div>
        <div>
          <label className="label" htmlFor="add-nozzle-label">
            Nozzle
          </label>
          <input
            id="add-nozzle-label"
            name="nozzle_label"
            type="text"
            placeholder="A"
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="add-nozzle-tank">
            Draws from
          </label>
          <select id="add-nozzle-tank" name="tank_id" required defaultValue="" className="input">
            <option value="" disabled>
              Choose a tank
            </option>
            {tanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                {tank.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="add-nozzle-start">
            Meter starts at
          </label>
          <NumberInput
            id="add-nozzle-start"
            name="starting_reading"
            defaultValue={0}
            min="0"
            step="0.01"
            required
            className="input tabular"
          />
        </div>

        <div className="sm:col-span-4">
          <FormMessage state={state} />
        </div>

        <div className="sm:col-span-4">
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add nozzle
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

/**
 * Nozzles taken out of service - removed from the wiring editor and the daily
 * reading sheet, but not gone. Same shape as the "Removed" customers list:
 * without this, "retired" would be indistinguishable from "lost".
 */
function RetiredNozzles({ nozzles }) {
  return (
    <div className="border-t border-ink-200 pt-4">
      <h3 className="text-sm font-bold text-ink-900">Retired</h3>
      <p className="mt-0.5 text-sm text-ink-600">
        Off the reading sheet. Every reading each one ever recorded still counts in reports and
        exports.
      </p>

      <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200">
        {nozzles.map((nozzle) => (
          <li
            key={nozzle.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <span className="text-ink-600">
              Unit {nozzle.unit_number} nozzle {nozzle.nozzle_label} — {nozzle.tank?.name}
              {Number(nozzle.reading_count) > 0
                ? ` · ${nozzle.reading_count} reading${Number(nozzle.reading_count) === 1 ? '' : 's'} on file`
                : ' · never used'}
            </span>
            <RestoreNozzleButton nozzleId={nozzle.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RestoreNozzleButton({ nozzleId }) {
  const [state, formAction] = useActionState(setNozzleActive, null);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="nozzle_id" value={nozzleId} />
      <input type="hidden" name="is_active" value="true" />
      <SubmitButton
        className="text-xs font-semibold text-brand-700 hover:underline"
        pendingLabel="Bringing back…"
      >
        Bring back
      </SubmitButton>
      {state?.ok === false ? <span className="text-xs text-red-700">{state.message}</span> : null}
    </form>
  );
}

/**
 * The confirmation for removing a nozzle - its own Dialog, rendered as a
 * sibling of the wiring form rather than inside it, and gated behind the
 * acting owner's own password the same way deleting a staff login is: what
 * happens next (deleted outright, or retired with history kept) depends on
 * data the person clicking cannot see from the row, and the password is what
 * stops a screen left open being used to remove one by accident.
 */
function DeleteNozzleDialog({ nozzle, onClose }) {
  const [state, formAction] = useActionState(deleteNozzle, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      onClose();
    }
  }, [state, onClose]);

  return (
    <Dialog
      open={Boolean(nozzle)}
      onClose={onClose}
      title={nozzle ? `Remove unit ${nozzle.unit_number} nozzle ${nozzle.nozzle_label}?` : 'Remove nozzle?'}
    >
      {nozzle ? (
        <form action={formAction} className="space-y-4 p-4">
          <input type="hidden" name="nozzle_id" value={nozzle.id} />

          <p className="text-sm text-ink-700">
            If this nozzle has never recorded a reading it is deleted for good. If it has, it is{' '}
            <span className="font-semibold">retired</span> instead — every past reading it
            carries is kept and keeps counting in reports and exports, but it comes off the daily
            reading sheet from now on.
          </p>

          <div>
            <label className="label" htmlFor="delete-nozzle-owner-password">
              Your own password
            </label>
            <input
              id="delete-nozzle-owner-password"
              name="owner_password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
            <p className="mt-1 text-sm text-ink-600">
              Asked for so that nobody who finds this screen open can remove a nozzle.
            </p>
          </div>

          {state?.ok === false ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton variant="danger" className="flex-1"  pendingLabel="Removing…">
              Remove this nozzle
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
