import {
  requirePageRole,
  ROLES,
  todayISO,
  shiftISODate,
  formatDate,
  formatLitres,
} from '@/app/_lib/helpers';
import {
  getExpectedStockForAllTanks,
  getStockChecks,
  getLubricantStock,
} from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import PendingLink from '@/app/_components/ui/PendingLink';
import DateNav from '@/app/_components/admin/DateNav';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';
import StockCheckForm from '@/app/_components/admin/StockCheckForm';

export const metadata = { title: 'Stock' };

/**
 * Everything the pump is holding: the two tanks, and the lubricant shelf.
 *
 * For the tanks this compares what the books say should be down there against
 * what the dip stick actually measures.
 *
 *   expected = last measured dip + fuel delivered since - litres sold since
 *
 * The expected figure is always computed in the database, never sent up from
 * the browser, so the gain/loss number cannot be talked into saying something
 * convenient.
 *
 * The lubricant shelf has no dip stick - a sealed carton is either there or it
 * is not - so it appears here as a book figure only: opening stock, plus what
 * was bought, minus what was sold. It is here rather than only on the Lubricants
 * page because "what stock am I holding" is one question, and answering half of
 * it on a different tab is how a reorder gets forgotten.
 */
const PER_PAGE = 25;

export default async function StockChecksPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const page = pageFrom(params);
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  const [tanks, checks, lubricants] = await Promise.all([
    getExpectedStockForAllTanks(date),
    getStockChecks(),
    getLubricantStock(date),
  ]);

  const checksOnDate = new Map(
    checks.filter((check) => check.check_date === date).map((check) => [check.tank_id, check]),
  );

  /*
   * Sliced rather than paged in Postgres: the lookup above needs whichever
   * check belongs to the DATE ON SCREEN, and that row is not necessarily on
   * the page of history being shown. Paging in the database would make the
   * form offer to re-record a dip that had already been taken.
   */
  const pageChecks = checks.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <PageHeader
        title="Stock"
        description="What is in the tanks and on the shelf on the day shown below."
      />

      {/* Own row, as on every other date-driven page - see
          docs/UI_CONVENTIONS.md. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <DateNav
          date={date}
          basePath="/admin/stock-checks"
          previousDate={shiftISODate(date, -1)}
          nextDate={shiftISODate(date, 1)}
        />
      </div>

      <h2 className="section-heading">
        Tanks — dip against the books
      </h2>

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

      {/* ---- the lubricant shelf ---- */}
      <h2 className="section-heading">
        Lubricant shelf
      </h2>

      {lubricants.length === 0 ? (
        <EmptyState
          title="No lubricants set up yet"
          description="Add the brands the pump stocks from the Lubricants section. Their stock will then be listed here alongside the tanks."
        />
      ) : (
        <>
          <div className="card table-scroll">
            <table className="w-full min-w-[38rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Lubricant</th>
                  <th className="th text-right">Opening</th>
                  <th className="th text-right">Bought</th>
                  <th className="th text-right">Sold</th>
                  <th className="th text-right">In stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {lubricants.map((row) => {
                  const left = Number(row.stock_litres ?? 0);
                  const pack = Number(row.pack_size_litres ?? 0);
                  return (
                    <tr key={row.id}>
                      <td className="td">
                        <span className="font-medium">{row.name}</span>
                        <span className="ml-2 text-sm text-ink-600">
                          {formatLitres(pack)} pack
                        </span>
                        {row.is_active ? null : (
                          <span className="badge ml-2 bg-ink-100 text-ink-600">retired</span>
                        )}
                      </td>
                      <td className="td-num text-ink-500">
                        {formatLitres(row.opening_stock_litres)}
                      </td>
                      <td className="td-num">{formatLitres(row.purchased_litres)}</td>
                      <td className="td-num">{formatLitres(row.sold_litres)}</td>
                      {/* Below a single pack is worth flagging: that is the
                          point at which the next customer cannot be served. */}
                      <td
                        className={[
                          'td-num font-bold',
                          left <= 0
                            ? 'text-red-700'
                            : left < pack
                              ? 'text-amber-800'
                              : 'text-ink-900',
                        ].join(' ')}
                      >
                        {formatLitres(left)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mb-8 mt-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-xs text-ink-600">
            A book figure, not a measured one — there is no dip stick for a shelf of tins. It is
            opening stock plus everything bought, minus everything sold, up to {formatDate(date)}.
            Sales are recorded under{' '}
            <PendingLink href="/admin/lubricants" className="font-semibold text-brand-700 underline">
              Lubricants
            </PendingLink>
            .
          </p>
        </>
      )}

      <h2 className="section-heading">
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
              {pageChecks.map((check) => {
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

      {checks.length > 0 ? (
        <Pager
          page={page}
          perPage={PER_PAGE}
          total={checks.length}
          hrefFor={(n) => `/admin/stock-checks?date=${date}&page=${n}`}
          label="Stock check pages"
        />
      ) : null}
    </>
  );
}
