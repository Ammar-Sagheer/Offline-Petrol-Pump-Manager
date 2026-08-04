'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { saveReading, deleteReading } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import NumberInput from '@/app/_components/ui/NumberInput';
import ReadingChainWarning from '@/app/_components/admin/ReadingChainWarning';
import Dialog from '@/app/_components/ui/Dialog';

/*
 * Formatting is done inline here rather than imported from helpers.js: that
 * module reaches into request cookies for the role checks, so it cannot be
 * pulled into a browser bundle.
 */
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const showLitres = (n) => `${litreFormat.format(n || 0)} L`;
const showMoney = (n) => `Rs ${moneyFormat.format(n || 0)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * One nozzle, as a compact row that opens a dialog.
 *
 * Six full-height forms stacked on one page meant a lot of scrolling, and -
 * worse - six near-identical forms in view at once, which is exactly how a
 * closing reading ends up typed into the wrong nozzle. Collapsed to rows, the
 * whole day fits on one screen and entry happens with everything else out of
 * the way.
 *
 * A dialog rather than an expanding row: an accordion pushes the rows below it
 * down and yanks them back on collapse, so you lose your place after every
 * save, and the credit slip list makes the page reflow as it grows.
 */
export default function ReadingForm({ row, date, customers, creditSales, canDelete }) {
  const isSaved = Boolean(row.reading_id);
  const [isOpen, setIsOpen] = useState(false);

  // Close once the save has gone through and come back from the server.
  const savedRef = useRef(isSaved);
  useEffect(() => {
    if (isSaved && !savedRef.current) setIsOpen(false);
    savedRef.current = isSaved;
  }, [isSaved]);

  const previousClosing =
    row.previous_closing === null || row.previous_closing === undefined
      ? null
      : Number(row.previous_closing);
  const openingUsed = Number(row.opening_reading ?? 0);
  const hasChainProblem =
    Boolean(row.later_date) || (previousClosing !== null && openingUsed !== previousClosing);

  const title = `Unit ${row.unit_number} · Nozzle ${row.nozzle_label}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="card block w-full px-4 py-3 text-left transition
                   hover:border-brand-300 hover:bg-brand-50/40
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink-900">{title}</span>
            <FuelBadge fuelType={row.fuel_type} />
            {hasChainProblem ? (
              <span className="badge bg-red-100 text-red-800">check</span>
            ) : null}
          </div>

          <span
            className={`badge shrink-0 ${
              isSaved ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {isSaved ? 'Entered' : 'Enter'}
          </span>
          <span aria-hidden="true" className="shrink-0 text-lg leading-none text-ink-400">
            ›
          </span>
        </div>

        {/* Every number gets its own label. The old single line read
            "100 L · Rs 30,000 · cash Rs 30,000", which needs someone to
            already know which figure is which - and left most of the row
            empty. Spread across the width, each one says what it is. */}
        {isSaved ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <RowFigure label="Fuel sold" value={showLitres(row.litres_sold)} strong />
            <RowFigure label="Total sale" value={showMoney(row.sale_amount)} strong />
            <RowFigure label="Cash in hand" value={showMoney(row.cash_amount)} />
            <RowFigure
              label="On credit"
              value={Number(row.credit_amount) > 0 ? showMoney(row.credit_amount) : '—'}
              tone={Number(row.credit_amount) > 0 ? 'credit' : 'muted'}
            />
          </dl>
        ) : (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <RowFigure
              label="Meter starts at"
              value={litreFormat.format(openingUsed)}
              strong
            />
            <RowFigure
              label="Today’s rate"
              value={row.rate ? `Rs ${row.rate} / litre` : 'Not set'}
              tone={row.rate ? undefined : 'warn'}
            />
            <div className="col-span-2 self-center text-xs text-ink-500 sm:col-span-2">
              Tap to enter the closing meter reading.
            </div>
          </dl>
        )}
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        subtitle={
          <div className="flex items-center gap-2">
            <FuelBadge fuelType={row.fuel_type} />
            <span className="text-xs text-ink-500">{formatDayLabel(date)}</span>
          </div>
        }
      >
        {isSaved ? (
          <SavedReading row={row} date={date} creditSales={creditSales} canDelete={canDelete} />
        ) : (
          <EntryForm row={row} date={date} customers={customers} />
        )}
      </Dialog>
    </>
  );
}

/**
 * One labelled figure in a nozzle row. The label is the point: it is what
 * turns "100 L" into "Fuel sold: 100 L".
 */
function RowFigure({ label, value, strong, tone }) {
  const valueTone =
    tone === 'muted' ? 'text-ink-400'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'credit' ? 'text-ink-900'
    : 'text-ink-900';

  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.65rem] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </dt>
      <dd
        className={`tabular truncate text-sm ${strong ? 'font-bold' : 'font-semibold'} ${valueTone}`}
      >
        {value}
      </dd>
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayLabel(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Already entered - show what was recorded
// ---------------------------------------------------------------------------

function SavedReading({ row, date, creditSales, canDelete }) {
  const [state, formAction] = useActionState(deleteReading, null);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* A saved row can still be part of a broken chain - flag it here rather
          than leaving it to be found in a stock loss weeks later. */}
      <ReadingChainWarning row={row} date={date} openingUsed={row.opening_reading} />

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Figure label="Opening" value={litreFormat.format(row.opening_reading)} />
        <Figure label="Closing" value={litreFormat.format(row.closing_reading)} />
        <Figure label="Sold" value={showLitres(row.litres_sold)} strong />
        <Figure label="Total" value={showMoney(row.sale_amount)} strong />
        <Figure label="Cash" value={showMoney(row.cash_amount)} />
        <Figure label="Credit" value={showMoney(row.credit_amount)} />
      </dl>

      {creditSales.length > 0 ? (
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Credit slips
          </p>
          <ul className="space-y-1 text-sm">
            {creditSales.map((slip) => (
              <li key={slip.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-ink-800">{slip.customer?.name ?? 'Unknown'}</span>
                <span className="tabular shrink-0 text-ink-600">
                  {showLitres(slip.litres)} · {showMoney(slip.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FormMessage state={state} />

      {canDelete ? (
        <form action={formAction} className="pt-1">
          <input type="hidden" name="reading_id" value={row.reading_id} />
          <SubmitButton className="btn-danger w-full text-xs" pendingLabel="Deleting…">
            Delete this reading
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function Figure({ label, value, strong }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={[
          'tabular mt-0.5',
          strong ? 'text-base font-bold text-ink-900' : 'text-sm font-medium text-ink-800',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not yet entered - the form
// ---------------------------------------------------------------------------

function EntryForm({ row, date, customers }) {
  const [state, formAction] = useActionState(saveReading, null);

  const opening = Number(row.opening_reading ?? 0);
  const rate = Number(row.rate ?? 0);

  const [closing, setClosing] = useState('');
  const [lines, setLines] = useState([]);

  const closingValue = closing === '' ? null : Number(closing);
  const hasClosing = closingValue !== null && Number.isFinite(closingValue);

  const litres = hasClosing ? round2(closingValue - opening) : 0;
  const saleAmount = round2(litres * rate);
  const creditTotal = round2(
    lines.reduce((total, line) => total + (Number(line.amount) || 0), 0),
  );
  const cashAmount = round2(saleAmount - creditTotal);

  const meterWentBackwards = hasClosing && closingValue < opening;
  const creditExceedsSale = hasClosing && cashAmount < 0;
  const canSubmit = rate > 0 && hasClosing && !meterWentBackwards && !creditExceedsSale;

  function addLine() {
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), customer_id: '', litres: '', amount: '' },
    ]);
  }

  function updateLine(key, patch) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  /* Typing litres fills the amount in at today's rate; the amount stays
     editable, because a slip is occasionally rounded off by hand. */
  function onLitresChange(key, value) {
    const asNumber = Number(value);
    updateLine(key, {
      litres: value,
      amount: Number.isFinite(asNumber) && value !== '' ? String(round2(asNumber * rate)) : '',
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 p-4">
      <input type="hidden" name="nozzle_id" value={row.nozzle_id} />
      <input type="hidden" name="reading_date" value={date} />
      <input type="hidden" name="opening_reading" value={opening} />
      <input type="hidden" name="rate_per_litre" value={rate} />
      <input
        type="hidden"
        name="credit_lines"
        value={JSON.stringify(
          lines.map(({ customer_id, litres: l, amount }) => ({
            customer_id,
            litres: Number(l),
            amount: Number(amount),
          })),
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">Opening</span>
          <p className="tabular rounded-lg border border-ink-200 bg-ink-100 px-3 py-2.5 text-lg font-semibold text-ink-600">
            {litreFormat.format(opening)}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`closing-${row.nozzle_id}`}>
            Closing
          </label>
          <NumberInput
            id={`closing-${row.nozzle_id}`}
            // Without a name the field is not submitted at all, however it
            // looks on screen - the server would only ever see an empty value.
            name="closing_reading"
            step="0.01"
            min={opening}
            required
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            className="input-number"
            placeholder="0.00"
          />
        </div>
      </div>

      {meterWentBackwards ? (
        <p className="text-sm font-medium text-red-700">
          The closing reading is below the opening reading of {litreFormat.format(opening)}.
        </p>
      ) : null}

      {/* Says so before saving if this day does not join onto its neighbours. */}
      <ReadingChainWarning row={row} date={date} openingUsed={opening} />

      {rate > 0 ? (
        <p className="text-xs text-ink-500">
          Rate: <span className="tabular font-semibold text-ink-700">Rs {rate}</span> per litre
        </p>
      ) : (
        <p className="text-sm font-medium text-amber-800">
          No rate is set for {row.fuel_type} on this date, so this nozzle cannot be saved yet.
        </p>
      )}

      {/* Running total, so a mistyped digit is obvious before saving */}
      <div className="rounded-lg bg-ink-900 px-4 py-3 text-white">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-300">Sold</span>
          <span className="tabular text-xl font-bold">{showLitres(litres)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-300">Value</span>
          <span className="tabular text-xl font-bold">{showMoney(saleAmount)}</span>
        </div>
      </div>

      {/* ---- credit slips ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Credit slips
          </span>
          {/* The main action on this card once the meter is in, so it is given
              the brand colour rather than the pale secondary style - it was
              easy to miss against the rest of the form. */}
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300
                       bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition
                       hover:border-brand-500 hover:bg-brand-100
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add customer
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-xs text-ink-500">
            None yet — the whole amount is treated as cash. Took fuel on credit? Add them above.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.key} className="rounded-lg border border-ink-200 bg-ink-50 p-2">
                <div className="flex gap-2">
                  <select
                    required
                    aria-label="Customer"
                    value={line.customer_id}
                    onChange={(event) => updateLine(line.key, { customer_id: event.target.value })}
                    className="input py-2 text-sm"
                  >
                    <option value="">Choose customer…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                        {customer.vehicle_number ? ` (${customer.vehicle_number})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label="Remove this slip"
                    className="btn-secondary shrink-0 px-2.5 py-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberInput
                    step="0.01"
                    min="0"
                    required
                    aria-label="Litres"
                    placeholder="Litres"
                    value={line.litres}
                    onChange={(event) => onLitresChange(line.key, event.target.value)}
                    className="input tabular py-2 text-sm"
                  />
                  <NumberInput
                    step="0.01"
                    min="0"
                    required
                    aria-label="Amount"
                    placeholder="Amount"
                    value={line.amount}
                    onChange={(event) => updateLine(line.key, { amount: event.target.value })}
                    className="input tabular py-2 text-sm"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- the split ---- */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-ink-200 p-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Cash</p>
          <p
            className={[
              'tabular mt-0.5 text-lg font-bold',
              creditExceedsSale ? 'text-red-700' : 'text-ink-900',
            ].join(' ')}
          >
            {showMoney(cashAmount)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Credit</p>
          <p className="tabular mt-0.5 text-lg font-bold text-ink-900">{showMoney(creditTotal)}</p>
        </div>
      </div>

      {creditExceedsSale ? (
        <p className="text-sm font-medium text-red-700">
          The slips come to more than this nozzle sold. Check the litres and amounts.
        </p>
      ) : (
        <p className="text-xs text-ink-500">
          Cash is worked out for you. Check it against the notes in the drawer before saving.
        </p>
      )}

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full" disabled={!canSubmit}>
        Save nozzle
      </SubmitButton>
    </form>
  );
}
