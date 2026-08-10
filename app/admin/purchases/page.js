import {
  requirePageRole,
  ROLES,
  formatDate,
  formatLitres,
  formatPKR,
  formatRate,
} from '@/app/_lib/helpers';
import {
  getPurchases,
  getTanks,
  getLubricantPurchases,
  getLubricants,
} from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import PurchaseForm from '@/app/_components/admin/PurchaseForm';
import LubricantPurchaseForm from '@/app/_components/admin/LubricantPurchaseForm';
import PaymentStatusToggle from '@/app/_components/admin/PaymentStatusToggle';
import DeletePurchaseButton from '@/app/_components/admin/DeletePurchaseButton';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';

export const metadata = { title: 'Purchases' };

/**
 * Everything the pump buys in, in one list.
 *
 * Fuel and lubricants are two different deliveries from two different
 * suppliers, but they are the same question at the end of the month - what went
 * out on stock, and how much of it is still owed - so they share one table
 * rather than sitting in two that have to be added up by eye. The Item column
 * carries the tank for fuel and the product for a lubricant; the badge beside
 * it is what makes the two tell apart at a glance.
 */
const PER_PAGE = 25;

export default async function PurchasesPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const page = pageFrom(await searchParams);
  const [tanks, fuelPurchases, lubricantPurchases, lubricants] = await Promise.all([
    getTanks(),
    getPurchases(),
    getLubricantPurchases(),
    getLubricants(),
  ]);

  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  // The shelf and the shed buy from different people and get their own button.
  const packedLubricants = lubricants.filter((row) => !row.sold_loose);
  const looseDrums = lubricants.filter((row) => row.sold_loose);

  // One shape for both, so the table below does not have to keep asking which
  // kind of row it is looking at. `kind` travels with the row because the
  // payment toggle and the delete button need to know which table to write to.
  const rows = [
    ...fuelPurchases.map((purchase) => ({
      id: purchase.id,
      kind: 'fuel',
      date: purchase.purchase_date,
      item: purchase.tank?.name ?? 'Tank',
      badge: purchase.tank?.fuel_type,
      supplier: purchase.supplier_name,
      invoice: purchase.invoice_number,
      litres: purchase.quantity_litres,
      rate: purchase.rate,
      cost: purchase.total_cost,
      paymentStatus: purchase.payment_status,
      createdAt: purchase.created_at,
    })),
    ...lubricantPurchases.map((purchase) => ({
      id: purchase.id,
      kind: 'lubricant',
      date: purchase.purchase_date,
      item: purchase.lubricant?.name ?? 'Lubricant',
      badge: 'lubricant',
      supplier: purchase.supplier_name,
      invoice: purchase.invoice_number,
      litres: purchase.quantity_litres,
      rate: purchase.rate,
      cost: purchase.total_cost,
      paymentStatus: purchase.payment_status,
      createdAt: purchase.created_at,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  /*
   * Sliced here rather than paged in the database, because both figures below
   * are worked out from EVERY row - what is still owed to suppliers, and what
   * the lubricant shelf has cost. A database page would make each of them a
   * total of whatever happened to be on screen. Deliveries are a few a week, so
   * the whole set is small; see getPurchases for when that stops being true.
   *
   * The two tables also cannot be paged in Postgres without a union view, since
   * a page of this list can hold rows from either.
   */
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pendingTotal = rows
    .filter((row) => row.paymentStatus === 'pending')
    .reduce((total, row) => total + Number(row.cost), 0);

  const lubricantSpend = lubricantPurchases.reduce(
    (total, purchase) => total + Number(purchase.total_cost),
    0,
  );

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Everything bought in — fuel into the tanks, lubricants onto the shelf, a drum of loose oil into the shed. Recording one adds it to stock."
      >
        {/* All behind dialogs rather than sitting open on the page: a delivery
            is logged once a day at most, and the table below already needs the
            page's full width - see the comment on PurchaseForm itself.

            A drum gets its own button rather than being one more option in the
            lubricant dropdown. It arrives from a different supplier with no
            brand on it, and the form asks slightly different questions - so
            splitting it here is what lets each form say the right thing rather
            than hedging between the two. The button appears only once a drum
            exists to buy for. */}
        <PurchaseForm tanks={tanks} />
        <LubricantPurchaseForm lubricants={packedLubricants} />
        {looseDrums.length > 0 ? (
          <LubricantPurchaseForm lubricants={looseDrums} kind="loose" />
        ) : null}
      </PageHeader>

      <div>
        {isOwner && pendingTotal > 0 ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">{formatPKR(pendingTotal)}</span> still owed to
            suppliers across unpaid deliveries.
          </p>
        ) : null}

        {lubricants.length === 0 && lubricantPurchases.length === 0 ? (
          <p className="mb-4 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600">
            No lubricants have been set up yet, so only fuel can be recorded here. Add the brands
            the pump stocks under Lubricants and they will appear in this list too.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing bought in yet"
            description="Record a delivery and it will show up here, and be added to the tank or the shelf it went into."
          />
        ) : (
          <div className="card table-scroll">
            {/* Wide: eight columns once the owner's delete action is included.
                Recording a purchase is a dialog rather than a form beside the
                table, so there is no fixed-width column eating into this. */}
            <table className="w-full min-w-[56rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Item</th>
                  <th className="th">Supplier</th>
                  <th className="th text-right">Litres</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Cost</th>
                  <th className="th">Payment</th>
                  {isOwner ? <th className="th sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {pageRows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td className="td whitespace-nowrap">{formatDate(row.date)}</td>
                    {/* Badge and name on ONE line. The name sat under the badge
                        at first, which made every lubricant row taller than the
                        fuel rows either side of it and left the brand looking
                        like a footnote to its own purchase - when the brand is
                        the only thing telling one product from another. Inline,
                        the rows keep a single height and the name reads as the
                        item, which is what the column is for. */}
                    <td className="td min-w-[13rem]">
                      <span className="flex items-center gap-2">
                        <FuelBadge fuelType={row.badge} />
                        {row.kind === 'lubricant' ? (
                          <span className="font-medium">{row.item}</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="td">
                      <span className="font-medium">{row.supplier}</span>
                      {row.invoice ? (
                        <span className="block text-sm text-ink-600">#{row.invoice}</span>
                      ) : null}
                    </td>
                    <td className="td-num">{formatLitres(row.litres)}</td>
                    <td className="td-num">{formatRate(row.rate)}</td>
                    <td className="td-num font-semibold">{formatPKR(row.cost)}</td>
                    <td className="td">
                      {isOwner ? (
                        <PaymentStatusToggle
                          purchaseId={row.id}
                          status={row.paymentStatus}
                          kind={row.kind}
                        />
                      ) : (
                        <span
                          className={`badge ${
                            row.paymentStatus === 'paid'
                              ? 'bg-brand-100 text-brand-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {row.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                      )}
                    </td>
                    {isOwner ? (
                      <td className="td">
                        <DeletePurchaseButton
                          purchaseId={row.id}
                          kind={row.kind}
                          summary={`${formatLitres(row.litres)} of ${row.item} on ${formatDate(
                            row.date,
                          )}`}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 ? (
          <Pager
            page={page}
            perPage={PER_PAGE}
            total={rows.length}
            hrefFor={(n) => `/admin/purchases?page=${n}`}
            label="Purchase pages"
          />
        ) : null}

        {isOwner && lubricantSpend > 0 ? (
          <p className="mt-3 text-sm text-ink-600">
            Of the list above, <span className="font-semibold">{formatPKR(lubricantSpend)}</span> is
            lubricant stock.
          </p>
        ) : null}
      </div>
    </>
  );
}
