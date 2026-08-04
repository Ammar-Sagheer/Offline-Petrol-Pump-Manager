import {
  requirePageRole,
  ROLES,
  todayISO,
  shiftISODate,
  formatDate,
  formatLitres,
} from '@/app/_lib/helpers';
import { getExpectedStockForAllTanks, getStockChecks } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import DateNav from '@/app/_components/admin/DateNav';
import StockCheckForm from '@/app/_components/admin/StockCheckForm';

export const metadata = { title: 'Stock checks' };

/**
 * Compares what the books say should be in each tank against what the dip stick
 * actually measures.
 *
 *   expected = last measured dip + fuel delivered since - litres sold since
 *
 * The expected figure is always computed in the database, never sent up from
 * the browser, so the gain/loss number cannot be talked into saying something
 * convenient.
 */
export default async function StockChecksPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  const [tanks, checks] = await Promise.all([
    getExpectedStockForAllTanks(date),
    getStockChecks(),
  ]);

  const checksOnDate = new Map(
    checks.filter((check) => check.check_date === date).map((check) => [check.tank_id, check]),
  );

  return (
    <>
      <PageHeader
        title="Stock checks"
        description={`Dip readings for ${formatDate(date)}, against what the books expect.`}
      >
        <DateNav
          date={date}
          basePath="/admin/stock-checks"
          previousDate={shiftISODate(date, -1)}
          nextDate={shiftISODate(date, 1)}
        />
      </PageHeader>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {tanks.map((tank) => (
          <StockCheckForm
            key={tank.id}
            tank={tank}
            date={date}
            existingCheck={checksOnDate.get(tank.id) ?? null}
          />
        ))}
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        Previous checks
      </h2>

      {checks.length === 0 ? (
        <EmptyState
          title="No dip readings yet"
          description="Record the first physical dip above. From then on it becomes the baseline that every stock calculation is measured from."
        />
      ) : (
        <div className="card table-scroll">
          <table className="w-full min-w-[38rem]">
            <thead className="border-b border-ink-200 bg-ink-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Tank</th>
                <th className="th text-right">Expected</th>
                <th className="th text-right">Measured</th>
                <th className="th text-right">Gain / loss</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {checks.map((check) => {
                const difference = Number(check.gain_loss);
                return (
                  <tr key={check.id}>
                    <td className="td whitespace-nowrap">{formatDate(check.check_date)}</td>
                    <td className="td">
                      <FuelBadge fuelType={check.tank?.fuel_type} />
                    </td>
                    <td className="td-num">{formatLitres(check.expected_stock)}</td>
                    <td className="td-num">{formatLitres(check.actual_dip_reading)}</td>
                    <td
                      className={[
                        'td-num font-bold',
                        difference === 0
                          ? 'text-ink-600'
                          : difference > 0
                            ? 'text-brand-700'
                            : 'text-red-700',
                      ].join(' ')}
                    >
                      {difference > 0 ? '+' : ''}
                      {formatLitres(difference)}
                    </td>
                    <td className="td text-ink-600">{check.note ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
