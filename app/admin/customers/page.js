import Link from 'next/link';

import { requirePageRole, ROLES, formatPKR } from '@/app/_lib/helpers';
import { getCustomerBalances, getRetiredCustomers } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import EmptyState from '@/app/_components/ui/EmptyState';
import CustomerForm from '@/app/_components/admin/CustomerForm';
import RemoveCustomerButton, {
  RestoreCustomerButton,
  PurgeCustomerButton,
} from '@/app/_components/admin/RemoveCustomerButton';

export const metadata = { title: 'Customers' };

export default async function CustomersPage() {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  // Removed customers are only fetched for the owner, who is the only one who
  // can act on them - staff would get a list they cannot use.
  const [customers, retired] = await Promise.all([
    getCustomerBalances(),
    isOwner ? getRetiredCustomers() : Promise.resolve([]),
  ]);

  const totalOwed = customers.reduce(
    (total, customer) => total + Math.max(0, Number(customer.balance)),
    0,
  );
  const overLimit = customers.filter(
    (customer) =>
      customer.credit_limit !== null && Number(customer.balance) > Number(customer.credit_limit),
  );

  return (
    <>
      <PageHeader
        title="Customers"
        description="Credit accounts and what each one currently owes."
      >
        <CustomerForm />
      </PageHeader>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add the people who take fuel on credit. Once they exist you can attach them to credit slips on the readings screen."
        >
          <CustomerForm />
        </EmptyState>
      ) : (
        <>
          <div className="mb-6">
            <StatGrid columns={2}>
              <StatTile label="Total outstanding" value={formatPKR(totalOwed)} />
              <StatTile
                label="Over their limit"
                value={String(overLimit.length)}
                tone={overLimit.length > 0 ? 'negative' : 'default'}
              />
            </StatGrid>
          </div>

          <div className="card table-scroll">
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Customer</th>
                  <th className="th">Vehicle</th>
                  <th className="th text-right">Credit limit</th>
                  <th className="th text-right">Owes</th>
                  {isOwner ? (
                    <th className="th">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {customers.map((customer) => {
                  const balance = Number(customer.balance);
                  const limit =
                    customer.credit_limit === null ? null : Number(customer.credit_limit);
                  const isOverLimit = limit !== null && balance > limit;

                  return (
                    <tr key={customer.customer_id} className="hover:bg-ink-50">
                      <td className="td">
                        <Link
                          href={`/admin/customers/${customer.customer_id}`}
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          {customer.name}
                        </Link>
                        {isOverLimit ? (
                          <span className="badge ml-2 bg-red-100 text-red-800">Over limit</span>
                        ) : null}
                      </td>
                      <td className="td text-ink-600">{customer.vehicle_number ?? '—'}</td>
                      <td className="td-num text-ink-600">
                        {limit === null ? '—' : formatPKR(limit)}
                      </td>
                      <td
                        className={[
                          'td-num font-bold',
                          balance > 0
                            ? isOverLimit
                              ? 'text-red-700'
                              : 'text-ink-900'
                            : 'text-brand-700',
                        ].join(' ')}
                      >
                        {formatPKR(balance)}
                      </td>
                      {isOwner ? (
                        <td className="td">
                          <RemoveCustomerButton
                            customerId={customer.customer_id}
                            name={customer.name}
                            balance={balance}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Removed accounts, and the way back. Without this, "removed" would be
          indistinguishable from "lost" - and one of the two things Remove can
          do is only a hide, so the owner has to be able to see what he hid. */}
      {retired.length > 0 ? (
        <>
          <h2 className="section-heading">Removed</h2>
          <p className="mb-3 text-sm text-ink-600">
            Off the customer list and off the credit-slip dropdown. Everything they ever took or
            paid still counts towards the months it belongs to. A name added by mistake can be
            deleted for good from here — only if it never actually traded, and the app will say so
            if it did.
          </p>
          <div className="card table-scroll">
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Customer</th>
                  <th className="th">Vehicle</th>
                  <th className="th text-right">Owes</th>
                  <th className="th">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {retired.map((customer) => (
                  <tr key={customer.customer_id}>
                    <td className="td">
                      <Link
                        href={`/admin/customers/${customer.customer_id}`}
                        className="font-semibold text-ink-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="td text-ink-600">{customer.vehicle_number ?? '—'}</td>
                    <td className="td-num text-ink-600">{formatPKR(customer.balance)}</td>
                    {/* Bring back sits beside Delete for good on purpose: the
                        two opposite endings for a removed account, and the
                        recoverable one is named first and coloured as the
                        ordinary choice. */}
                    <td className="td">
                      <div className="flex flex-wrap items-start justify-end gap-x-4 gap-y-1">
                        <RestoreCustomerButton customerId={customer.customer_id} />
                        <PurgeCustomerButton
                          customerId={customer.customer_id}
                          name={customer.name}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
