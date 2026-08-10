// helpers.js, not format-helpers.js: both callers are Server Components, and
// that is where formatPKR and formatLitres live.
import { formatLitres, formatPKR } from '@/app/_lib/helpers';
import { formatDate } from '@/app/_lib/date-helpers';

/**
 * A day per row: litres, the split by fuel, and what the money did.
 *
 * Shared by the collapsible block on Reports, which shows the chosen month,
 * and the Daily sales page, which pages back through every day the pump has
 * traded. One component because the columns have to line up between them -
 * someone checking a figure on the history page against the month they were
 * just looking at should not have to re-read the headings.
 */
export default function DailySalesTable({ rows }) {
  return (
    <div className="table-scroll">
      <table className="w-full min-w-[46rem]">
        <thead className="border-b border-ink-200 bg-ink-50">
          <tr>
            <th className="th">Date</th>
            <th className="th text-right">Litres</th>
            <th className="th text-right">Petrol</th>
            <th className="th text-right">Diesel</th>
            <th className="th text-right">Fuel sales</th>
            <th className="th text-right">Cash</th>
            <th className="th text-right">Credit</th>
            <th className="th text-right">Lubricants</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.day}>
              <td className="td whitespace-nowrap">{formatDate(row.day)}</td>
              <td className="td-num">{formatLitres(row.litres_sold)}</td>
              <td className="td-num">{formatLitres(row.petrol_litres)}</td>
              <td className="td-num">{formatLitres(row.diesel_litres)}</td>
              <td className="td-num font-semibold">{formatPKR(row.sale_amount)}</td>
              <td className="td-num">{formatPKR(row.cash_amount)}</td>
              <td className="td-num">{formatPKR(row.credit_amount)}</td>
              {/* Litres and money together in one column: a lubricant day is a
                  handful of tins, so two columns of mostly blanks would cost
                  more width than the figures are worth. */}
              <td className="td-num text-ink-600">
                {Number(row.lubricant_amount) > 0
                  ? `${formatLitres(row.lubricant_litres)} · ${formatPKR(row.lubricant_amount)}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
