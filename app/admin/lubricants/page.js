import {
  requirePageRole,
  ROLES,
  todayISO,
  shiftISODate,
  formatDate,
  formatLitres,
  formatLitresFine,
  formatPKR,
  formatRate,
} from '@/app/_lib/helpers';
import {
  getLubricantDay,
  getLubricantStock,
  getLubricants,
  getCustomers,
} from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import DateNav from '@/app/_components/admin/DateNav';
import LubricantSaleForm from '@/app/_components/admin/LubricantSaleForm';
import LooseOilSaleForm from '@/app/_components/admin/LooseOilSaleForm';
import LubricantManager from '@/app/_components/admin/LubricantManager';
import DeleteLubricantSaleButton from '@/app/_components/admin/DeleteLubricantSaleButton';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';

export const metadata = { title: 'Lubricants' };

/*
 * A day, not a history - so this is bounded by how much can be sold in one day
 * rather than growing forever. It is paged anyway: a busy Saturday can run to
 * dozens of sales, and the shelf table below them is the thing that then
 * becomes unreachable. Sliced from the day already fetched, because the RPC
 * returns the whole day in one round trip and the totals above are worked out
 * from all of it.
 */
const PER_PAGE = 20;

/**
 * The lubricant counter: what was sold today, and what is left to sell.
 *
 * Its own section rather than a corner of Readings, because the two are
 * recorded in completely different ways. A day of fuel is worked out once, from
 * six meters. Oil is sold one tin at a time all day, so each sale is its own
 * row - which is also what makes a customer's credit slip for a carton land on
 * the same ledger as their diesel.
 *
 * Everything on the page follows the date in the header, the same as Readings
 * and Stock, so yesterday can be finished off this morning.
 */
export default async function LubricantsPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const params = await searchParams;
  const page = pageFrom(params);
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  const [day, stock, products, customers] = await Promise.all([
    getLubricantDay(date),
    getLubricantStock(date),
    // The manager needs retired products too, so a brand can be brought back.
    isOwner ? getLubricants({ includeRetired: true }) : Promise.resolve([]),
    getCustomers(),
  ]);

  const totals = day.totals ?? {};

  /*
   * ONE PAGE FOR BOTH KINDS OF OIL SALE, WHICH REVERSES AN EARLIER DECISION.
   *
   * The drum used to have a page of its own, and the reasoning is in
   * docs/CHANGELOG.md: a long run of rupee-priced pours buried the four carton
   * sales that actually need reading. That problem is real and has not gone
   * away - what changed is the answer to it. Splitting by route meant the
   * owner had to know which page a sale lived on before he could look for it,
   * and a day's oil takings were never on one screen. The pours now sit in the
   * same table, marked, with a filter above it: one tap gets the old view back
   * when a busy Saturday needs it, and the default shows the whole day.
   *
   * `kind` is a query string like every other filter here, so Back works
   * through it and a filtered view can be linked to.
   */
  const kind = ['packed', 'loose'].includes(params?.kind) ? params.kind : 'all';

  const allSales = day.sales ?? [];
  const sales =
    kind === 'all' ? allSales : allSales.filter((sale) => Boolean(sale.sold_loose) === (kind === 'loose'));

  const sellable = stock.filter((row) => row.is_active && !row.sold_loose);
  const sellableDrums = stock.filter((row) => row.is_active && row.sold_loose);
  const hasDrum = stock.some((row) => row.sold_loose);

  // The RPC gives each half separately; the day as a whole is added up here
  // rather than added to the RPC as a third set of sums that could fall out of
  // step with the other two.
  const packAmount = Number(totals.pack_amount ?? 0);
  const packCount = Number(totals.pack_count ?? 0);
  const looseCount = Number(totals.loose_count ?? 0);
  const looseAmount = Number(totals.loose_amount ?? 0);

  /* The day as a whole, which is what the top of the page now leads with. The
     credit figure covers both kinds on purpose: it answers "how much of
     today's oil is not in the drawer", and that question does not care which
     container the oil came out of. */
  const dayAmount = packAmount + looseAmount;
  const dayCredit = Number(totals.credit_amount ?? 0);
  const creditShare = dayAmount > 0 ? Math.round((dayCredit / dayAmount) * 100) : 0;

  const pageSales = sales.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  /* The date has to survive both controls, and the page number is dropped when
     the filter changes - staying on page 3 of a list that just became four
     rows long shows an empty table and reads as a broken filter. */
  const kindHref = (next) =>
    `/admin/lubricants?date=${date}${next === 'all' ? '' : `&kind=${next}`}`;
  const pageHref = (n) =>
    `/admin/lubricants?date=${date}${kind === 'all' ? '' : `&kind=${kind}`}&page=${n}`;

  /*
   * Packed first, the drum last. The shelf keeps both - someone counting what
   * is in the building wants one answer - but they are different things, and
   * an alphabetical sort was interleaving a drum measured in fractions of a
   * litre with cartons measured in whole ones.
   */
  const shelf = [...stock].sort(
    (a, b) => Number(a.sold_loose) - Number(b.sold_loose) || a.name.localeCompare(b.name),
  );

  return (
    <>
      {/* THE DESCRIPTION HAS TO SAY WHAT THE PAGE COUNTS. The old wording -
          "Counter sales. Stock is kept in litres, packs and loose oil alike" -
          described the stock and said nothing about the sales, while the
          figures underneath silently counted packed sales only. The owner read
          a day's total of zero above a shelf row saying the drum had sold a
          litre, and had no way to tell which of the two was wrong. Neither
          was: they were counting different things and nothing said so. */}
      <PageHeader
        title="Lubricants"
        description="Every oil sale of the day — sealed packs off the shelf and loose oil out of the drum — and what is left of each."
      />

      {/* The day's controls and the day's actions share a row of their own,
          rather than riding along in PageHeader's children the way a single
          button does.

          Why: this page carries more in that row than any other - two arrows,
          a date box, two actions - and "Back to today" appears only when the
          date is not today. Passed to PageHeader, that one conditional button
          was enough to tip the whole group over the wrap threshold, so the
          header jumped between one row and two as you stepped from today to
          yesterday and back. Given its own row the group cannot wrap against
          the title at all, and the controls stay exactly where they were on
          the previous day. Checked at 1440/1152/1024 and 400px, on today and
          on an older date. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <DateNav
          date={date}
          basePath="/admin/lubricants"
          previousDate={shiftISODate(date, -1)}
          nextDate={shiftISODate(date, 1)}
          extraParams={kind === 'all' ? undefined : { kind }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? <LubricantManager lubricants={products} /> : null}
          {/* Both ways of selling oil sit together, where someone who has just
              served a customer is already looking. The drum's button used to
              exist only inside its summary card further down the page, which
              put the more frequent of the two sales in the harder place to
              find. Each says which kind it records - "Record a sale" beside a
              second sale button says nothing. */}
          <LubricantSaleForm
            lubricants={sellable}
            customers={customers}
            date={date}
            dateLabel={formatDate(date)}
          />
          {sellableDrums.length > 0 ? (
            <LooseOilSaleForm
              drums={sellableDrums}
              customers={customers}
              date={date}
              dateLabel={formatDate(date)}
            />
          ) : null}
        </div>
      </div>

      {/* THE TEST IS NOW "IS THERE ANY OIL AT ALL", not "is there anything on
          the shelf". A pump that keeps only a drum is a real setup, and with
          both kinds on one page it has a full page to look at - it used to be
          sent away to the drum's own route, which no longer exists. */}
      {stock.length === 0 ? (
        <EmptyState
          title="No lubricants set up yet"
          description={
            isOwner
              ? 'Add the brands the pump stocks with “Manage lubricants” above — sealed packs, or a drum of loose oil. Once one is on the list it can be sold here, restocked from Purchases, and it will show up in the month’s report.'
              : 'Ask the owner to add the lubricants the pump stocks. They will appear here once they have.'
          }
        />
      ) : (
        <>
          {/* THE WHOLE DAY FIRST, THEN THE HALF THIS PAGE LISTS.
              These were four unqualified tiles - Sales / Litres sold / Cash /
              On credit - counting packed sales only, with no word anywhere
              saying so. Read beside a shelf table that includes the drum, the
              figures looked simply wrong: "0 sold today" over a row reading
              "Loose Oil, sold 1 L".
              Naming both halves and their total is what makes the page
              legible. The reader sees the day's whole oil takings, sees how it
              splits, and sees which half the table underneath details. */}
          <div className="mb-4" aria-label="Oil sales for the day">
            <StatGrid>
              <StatTile
                label="Oil sold today"
                value={formatPKR(dayAmount)}
                sub="packed and loose together"
              />
              <StatTile
                label="Packed, off the shelf"
                value={formatPKR(packAmount)}
                sub={
                  packCount > 0
                    ? `${packCount} ${packCount === 1 ? 'sale' : 'sales'} · ${formatLitres(totals.pack_litres)} · listed below`
                    : 'nothing sold yet'
                }
              />
              <StatTile
                label="Loose, out of the drum"
                value={formatPKR(looseAmount)}
                sub={
                  looseCount > 0
                    ? `${looseCount} ${looseCount === 1 ? 'pour' : 'pours'} · listed below`
                    : hasDrum
                      ? 'nothing poured yet'
                      : 'no drum set up'
                }
              />
              <StatTile
                label="On credit"
                value={formatPKR(dayCredit)}
                sub={dayAmount > 0 ? `${creditShare}% of the day · rest was cash` : null}
                tone={dayCredit > 0 ? 'negative' : 'default'}
              />
            </StatGrid>
          </div>

          {/* The drum's day, summarised with a way through to it. Here rather
              than only in the nav because someone standing on this page has
              just recorded a sale and is the person most likely to need the
              other kind next - and because a day is not finished until both
              halves are in. */}
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="section-heading mb-0 mt-0">Sold on {formatDate(date)}</h2>
              <p className="mt-1 text-sm text-ink-600">
                One row per sale. Pours out of the drum are marked{' '}
                <span className="badge bg-amber-100 text-amber-900">loose</span>.
              </p>
            </div>

            {/* Only worth drawing when there is a drum to tell apart from the
                shelf. On a pump that sells packs only it would be three
                buttons where two of them can never change anything. */}
            {hasDrum ? (
              <div
                role="group"
                aria-label="Which oil sales to show"
                className="inline-flex flex-wrap gap-1 rounded-xl border border-ink-300 bg-white p-1"
              >
                <KindChip href={kindHref('all')} active={kind === 'all'}>
                  All oil
                </KindChip>
                <KindChip href={kindHref('packed')} active={kind === 'packed'}>
                  Packed only
                </KindChip>
                <KindChip href={kindHref('loose')} active={kind === 'loose'}>
                  Loose only
                </KindChip>
              </div>
            ) : null}
          </div>

          {sales.length === 0 ? (
            <EmptyState
              title={
                kind === 'loose'
                  ? 'Nothing poured from the drum on this date'
                  : kind === 'packed'
                    ? 'Nothing packed sold on this date'
                    : 'Nothing sold yet on this date'
              }
              description="Use the buttons above — “Record a lubricant sale” for a sealed carton or bottle off the shelf, “Record a loose oil sale” for what someone paid for a pour out of the drum."
            />
          ) : (
            <div className="card table-scroll">
              <table className="w-full min-w-[46rem]">
                <thead className="border-b border-ink-200 bg-ink-50">
                  <tr>
                    <th className="th">Lubricant</th>
                    <th className="th text-right">Litres</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-right">Cash</th>
                    <th className="th text-right">Credit</th>
                    <th className="th">Customer</th>
                    {isOwner ? (
                      <th className="th">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pageSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="td">
                        <span className="font-medium">{sale.name}</span>
                        {/* The one thing that tells the two kinds apart now
                            they share a table. Same badge as the shelf below,
                            so it means the same thing in both places. */}
                        {sale.sold_loose ? (
                          <span className="badge ms-2 bg-amber-100 text-amber-900">loose</span>
                        ) : null}
                        {sale.note ? (
                          <span className="block text-sm text-ink-600">{sale.note}</span>
                        ) : null}
                      </td>
                      {/* A pour is a fraction of a litre - "0.03 L" at two
                          decimals is most of a rupee's worth rounded away. */}
                      <td className="td-num">
                        {sale.sold_loose
                          ? formatLitresFine(sale.litres)
                          : formatLitres(sale.litres)}
                      </td>
                      <td className="td-num text-ink-500">{formatRate(sale.rate_per_litre)}</td>
                      <td className="td-num font-semibold">{formatPKR(sale.amount)}</td>
                      <td className="td-num">{formatPKR(sale.cash_amount)}</td>
                      <td
                        className={`td-num ${
                          Number(sale.credit_amount) > 0 ? 'font-semibold text-amber-800' : 'text-ink-400'
                        }`}
                      >
                        {Number(sale.credit_amount) > 0 ? formatPKR(sale.credit_amount) : '—'}
                      </td>
                      <td className="td">
                        {sale.customer_id ? (
                          <PendingLink
                            href={`/admin/customers/${sale.customer_id}`}
                            className="font-medium text-brand-700 underline"
                          >
                            {sale.customer_name}
                          </PendingLink>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      {isOwner ? (
                        <td className="td">
                          <DeleteLubricantSaleButton
                            saleId={sale.id}
                            summary={`${formatLitres(sale.litres)} of ${sale.name}`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sales.length > 0 ? (
            <Pager
              page={page}
              perPage={PER_PAGE}
              total={sales.length}
              hrefFor={pageHref}
              label="Sale pages"
            />
          ) : null}

          {/* The shelf, as at the date on screen. Here as well as on Stock
              because it is what someone recording a sale needs to know, and
              sending them to another tab to find it is how a sale gets typed
              against a product that ran out last week. */}
          {/* THE TIMEFRAME BELONGS IN THE HEADING, not in small print at the
              bottom. Bought and Sold here are running totals since the pump
              opened, and they sit two inches under a set of figures for one
              day - which is how a shelf row reading "sold 1 L" ends up looking
              like it contradicts "nothing sold today". It never did; nothing
              said the two were counting different spans. */}
          <h2 className="section-heading mb-1">On the shelf</h2>
          <p className="mb-4 text-sm text-ink-600">
            Everything bought and sold up to {formatDate(date)}, not just today. The drum is
            included — it is stock in the building like anything else.
          </p>

          <div className="card table-scroll max-h-none">
            <table className="w-full min-w-[40rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Lubricant</th>
                  <th className="th text-right">Pack</th>
                  <th className="th text-right">Selling rate</th>
                  <th className="th text-right">Bought to date</th>
                  <th className="th text-right">Sold to date</th>
                  <th className="th text-right">In stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {shelf.map((row) => {
                  const left = Number(row.stock_litres ?? 0);
                  /* Below one whole pack there is nothing left to sell as a
                     pack; for the drum, ten litres is roughly a week. */
                  const lowAt = row.sold_loose ? 10 : Number(row.pack_size_litres ?? 0);
                  const state = left <= 0 ? 'out' : left < lowAt ? 'low' : 'ok';

                  return (
                    <tr key={row.id}>
                      <td className="td font-medium">
                        {row.name}
                        {row.sold_loose ? (
                          <span className="badge ml-2 bg-amber-100 text-amber-900">loose</span>
                        ) : null}
                        {row.is_active ? null : (
                          <span className="badge ml-2 bg-ink-100 text-ink-600">retired</span>
                        )}
                      </td>
                      {/* A drum has no pack size worth printing, and its
                          quantities are fractions of a litre - so it gets the
                          finer formatter while the shelf keeps the plain one. */}
                      <td className="td-num text-ink-500">
                        {row.sold_loose ? '—' : formatLitres(row.pack_size_litres)}
                      </td>
                      {/* CARRIED OVER FROM THE DRUM'S OLD PAGE, which showed
                          this and the shelf did not. For a drum the rate is
                          load-bearing rather than informational: it is the
                          only thing turning "Rs 20 of oil" into litres off the
                          stock, so a wrong one drains the drum on paper at the
                          wrong speed and nothing else on the page would say
                          why. Worth showing for a pack too. */}
                      <td className="td-num text-ink-500">
                        {Number(row.sale_rate_per_litre) > 0 ? (
                          formatRate(row.sale_rate_per_litre)
                        ) : row.sold_loose ? (
                          <span className="font-semibold text-amber-800">not set</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="td-num">{formatLitres(row.purchased_litres)}</td>
                      <td className="td-num">
                        {row.sold_loose
                          ? formatLitresFine(row.sold_litres)
                          : formatLitres(row.sold_litres)}
                      </td>
                      <td className="td-num">
                        <span
                          className={[
                            'font-bold',
                            state === 'out'
                              ? 'text-red-700'
                              : state === 'low'
                                ? 'text-amber-800'
                                : 'text-ink-900',
                          ].join(' ')}
                        >
                          {row.sold_loose ? formatLitresFine(left) : formatLitres(left)}
                        </span>

                        {/*
                          THE WORD, NOT JUST THE COLOUR. This column was telling
                          the reader that a product had run out by printing the
                          number in red and nothing else - which is exactly the
                          failure the icon and colour rules in
                          docs/UI_CONVENTIONS.md exist to prevent, on the screen
                          least able to survive it: a cheap tablet in a dim
                          office. "0 L" in red and "16 L" in black are the same
                          shape to a red-green colourblind reader.
                        */}
                        {state === 'ok' ? null : (
                          <span
                            className={`badge ms-2 ${
                              state === 'out'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {state === 'out' ? 'out of stock' : 'low'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasDrum ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              What comes off the drum is <span className="font-semibold">worked out from its
              rate, not measured</span>. If the level in the yard stops matching the figure here,
              the rate is what to check.
            </p>
          ) : null}

          <p className="mt-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600">
            Restock a lubricant from{' '}
            <PendingLink href="/admin/purchases" className="font-semibold text-brand-700 underline">
              Purchases
            </PendingLink>
            , where it sits alongside the fuel deliveries.
          </p>
        </>
      )}
    </>
  );
}

/**
 * One choice in the packed/loose filter.
 *
 * The selected one is a `<span>`, not a link - the same rule `<Pager>`,
 * `<TrendRange>` and the Activity filter all follow: a link styled to look
 * inert still takes focus and still navigates, to the page you are already on.
 *
 * `scroll={false}` because only the table below changes. Sending the reader
 * back to the top of the page to look at a list they were already looking at
 * is the bug that was reported on the dashboard's chart window.
 */
function KindChip({ href, active, children }) {
  if (active) {
    return (
      <span
        aria-current="true"
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
      >
        {children}
      </span>
    );
  }

  return (
    <PendingLink
      href={href}
      scroll={false}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold
                 text-ink-700 hover:bg-ink-100 hover:text-ink-900"
    >
      {children}
    </PendingLink>
  );
}
