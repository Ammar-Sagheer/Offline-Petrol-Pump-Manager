import { formatDate, formatPKR, formatLitres } from '@/app/_lib/helpers';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';

/**
 * The full ledger, newest first, with a running balance.
 *
 * The running total is worked out oldest-first and then flipped for display, so
 * each row shows what was owed immediately after that entry - which is how a
 * paper khata reads.
 */
export default function CustomerLedgerTable({ entries }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing recorded yet"
        description="Credit slips appear here automatically once a reading with this customer is saved. Payments can be recorded from the form alongside."
      />
    );
  }

  const oldestFirst = [...entries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });

  let running = 0;
  const withBalance = oldestFirst.map((entry) => {
    running += entry.entry_type === 'debit' ? Number(entry.amount) : -Number(entry.amount);
    return { ...entry, balanceAfter: Math.round((running + Number.EPSILON) * 100) / 100 };
  });

  const newestFirst = withBalance.reverse();

  return (
    <div className="card table-scroll">
      <table className="w-full min-w-[40rem]">
        <thead className="border-b border-ink-200 bg-ink-50">
          <tr>
            <th className="th">Date</th>
            <th className="th">Detail</th>
            <th className="th text-right">Fuel taken</th>
            <th className="th text-right">Paid</th>
            <th className="th text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {newestFirst.map((entry) => {
            const isDebit = entry.entry_type === 'debit';
            return (
              <tr key={entry.id}>
                <td className="td whitespace-nowrap">{formatDate(entry.entry_date)}</td>
                <td className="td">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{entry.note ?? (isDebit ? 'Fuel on credit' : 'Payment')}</span>
                    {entry.fuel_type ? <FuelBadge fuelType={entry.fuel_type} /> : null}
                    {entry.credit_sale_id ? (
                      <span
                        className="badge bg-ink-100 text-ink-600"
                        title="Posted automatically from a nozzle reading"
                      >
                        auto
                      </span>
                    ) : null}
                  </div>
                  {entry.litres ? (
                    <span className="tabular mt-0.5 block text-sm text-ink-600">
                      {formatLitres(entry.litres)}
                    </span>
                  ) : null}
                </td>
                <td className="td-num text-red-700">
                  {isDebit ? formatPKR(entry.amount) : '—'}
                </td>
                <td className="td-num text-brand-700">
                  {isDebit ? '—' : formatPKR(entry.amount)}
                </td>
                <td className="td-num font-bold text-ink-900">
                  {formatPKR(entry.balanceAfter)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
