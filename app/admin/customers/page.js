import Link from 'next/link';

import { requirePageRole, ROLES, formatPKR } from '@/app/_lib/helpers';
import { getCustomerBalances } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';

export const metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const customers = await getCustomerBalances();

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
        <Link href="/admin/customers/new" className="btn-primary">
          + New customer
        </Link>
      </PageHeader>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add the people who take fuel on credit. Once they exist you can attach them to credit slips on the readings screen."
        >
          <Link href="/admin/customers/new" className="btn-primary">
            Add the first customer
          </Link>
        </EmptyState>
      ) : (
        <>
          <section className="card mb-6 grid grid-cols-2 gap-px overflow-hidden bg-ink-200">
            <div className="bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Total outstanding
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-ink-900">
                {formatPKR(totalOwed)}
              </p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Over their limit
              </p>
              <p
                className={`tabular mt-1 text-2xl font-bold ${
                  overLimit.length > 0 ? 'text-red-700' : 'text-ink-900'
                }`}
              >
                {overLimit.length}
              </p>
            </div>
          </section>

          <div className="card table-scroll">
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Customer</th>
                  <th className="th">Vehicle</th>
                  <th className="th text-right">Credit limit</th>
                  <th className="th text-right">Owes</th>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
