import { requirePageRole, ROLES, formatDate, formatLitres, formatPKR } from '@/app/_lib/helpers';
import { getPurchases, getTanks } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import PurchaseForm from '@/app/_components/admin/PurchaseForm';
import PaymentStatusToggle from '@/app/_components/admin/PaymentStatusToggle';
import DeletePurchaseButton from '@/app/_components/admin/DeletePurchaseButton';

export const metadata = { title: 'Fuel purchases' };

export default async function PurchasesPage() {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const [tanks, purchases] = await Promise.all([getTanks(), getPurchases()]);

  const isOwner = profile.role === ROLES.SUPER_ADMIN;
  const pendingTotal = purchases
    .filter((purchase) => purchase.payment_status === 'pending')
    .reduce((total, purchase) => total + Number(purchase.total_cost), 0);

  return (
    <>
      <PageHeader
        title="Fuel purchases"
        description="Stock coming in from the supplier. Recording a delivery adds it to the tank."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
        <div>
          <PurchaseForm tanks={tanks} />
        </div>

        <div>
          {isOwner && pendingTotal > 0 ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">{formatPKR(pendingTotal)}</span> still owed to
              suppliers across unpaid deliveries.
            </p>
          ) : null}

          {purchases.length === 0 ? (
            <EmptyState
              title="No deliveries recorded yet"
              description="Record a delivery on the left and it will show up here, and be added to the tank's stock."
            />
          ) : (
            <div className="card table-scroll">
              {/* Wider than the other tables: seven columns once the owner's
                  delete action is included. */}
              <table className="w-full min-w-[52rem]">
                <thead className="border-b border-ink-200 bg-ink-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Tank</th>
                    <th className="th">Supplier</th>
                    <th className="th text-right">Litres</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Cost</th>
                    <th className="th">Payment</th>
                    {isOwner ? <th className="th sr-only">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td className="td whitespace-nowrap">{formatDate(purchase.purchase_date)}</td>
                      <td className="td">
                        <FuelBadge fuelType={purchase.tank?.fuel_type} />
                      </td>
                      <td className="td">
                        <span className="font-medium">{purchase.supplier_name}</span>
                        {purchase.invoice_number ? (
                          <span className="block text-xs text-ink-500">
                            #{purchase.invoice_number}
                          </span>
                        ) : null}
                      </td>
                      <td className="td-num">{formatLitres(purchase.quantity_litres)}</td>
                      <td className="td-num">{formatPKR(purchase.rate)}</td>
                      <td className="td-num font-semibold">{formatPKR(purchase.total_cost)}</td>
                      <td className="td">
                        {isOwner ? (
                          <PaymentStatusToggle
                            purchaseId={purchase.id}
                            status={purchase.payment_status}
                          />
                        ) : (
                          <span
                            className={`badge ${
                              purchase.payment_status === 'paid'
                                ? 'bg-brand-100 text-brand-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {purchase.payment_status === 'paid' ? 'Paid' : 'Pending'}
                          </span>
                        )}
                      </td>
                      {isOwner ? (
                        <td className="td">
                          <DeletePurchaseButton
                            purchaseId={purchase.id}
                            summary={`${formatLitres(purchase.quantity_litres)} on ${formatDate(
                              purchase.purchase_date,
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
        </div>
      </div>
    </>
  );
}
