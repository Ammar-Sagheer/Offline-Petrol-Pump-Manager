'use client';

import { useState } from 'react';

import Dialog from '@/app/_components/ui/Dialog';
import NozzleTankForm from '@/app/_components/admin/NozzleTankForm';

/**
 * Which tank each nozzle draws from, and where its meter started - behind a
 * dialog for the same reason a bank account is: set once when the pump goes
 * onto the system and then almost never touched again, so a six-row table
 * with a Save button on every line does not deserve to sit open on the
 * settings page for good.
 *
 * Six independent rows rather than one form, so there is no single submit to
 * close the dialog on success - it stays open until Done is pressed, Escape,
 * or the backdrop, however many rows were touched in the one visit.
 */
export default function NozzleSettingsButton({ nozzles, tanks }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="btn-secondary">
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
          <span className="text-xs text-ink-500">
            Which tank each nozzle draws from, and where its meter started
          </span>
        }
      >
        <div className="space-y-4 p-4">
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
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Unit</th>
                  <th className="th">Nozzle</th>
                  <th className="th">Draws from &amp; meter starts at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {nozzles.map((nozzle) => (
                  <tr key={nozzle.id}>
                    <td className="td font-medium">Unit {nozzle.unit_number}</td>
                    <td className="td">Nozzle {nozzle.nozzle_label}</td>
                    <td className="td">
                      <NozzleTankForm nozzle={nozzle} tanks={tanks} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-ink-200 pt-4">
            <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
              Done
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
