import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requirePageRole, ROLES, formatPKR, formatLitres } from '@/app/_lib/helpers';
import { getCustomerStatement, getLedgerEntriesPage } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import PaymentForm from '@/app/_components/admin/PaymentForm';
import LedgerAdjustmentForm from '@/app/_components/admin/LedgerAdjustmentForm';
import CustomerLedgerTable from '@/app/_components/admin/CustomerLedgerTable';
import EditCustomerButton from '@/app/_components/admin/EditCustomerButton';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const statement = await getCustomerStatement(id);
    return { title: statement?.customer?.name ?? 'Customer' };
  } catch {
    return { title: 'Customer' };
  }
}

const PER_PAGE = 25;

export default async function CustomerDetailPage({ params, searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const { id } = await params;
  const page = pageFrom(await searchParams);

  /*
   * The balance and the fuel breakdown come from the statement RPC, which sums
   * over the whole ledger in Postgres - so paging the ENTRIES here changes only
   * what is listed, never what is owed. That is what makes a database page safe
   * on this screen and not on Purchases.
   */
  const [statement, { rows: entries, total: entryCount }] = await Promise.all([
    getCustomerStatement(id),
    getLedgerEntriesPage(id, { page, perPage: PER_PAGE }),
  ]);

  const customer = statement?.customer;
  if (!customer) notFound();

  const balance = Number(statement.balance ?? 0);
  const limit = customer.credit_limit === null ? null : Number(customer.credit_limit);
  const isOverLimit = limit !== null && balance > limit;

  return (
    <>
      <PageHeader
        title={customer.name}
        description={[customer.vehicle_number, customer.phone].filter(Boolean).join(' · ') || null}
      >
        <EditCustomerButton customer={customer} />
        <Link href="/admin/customers" className="btn-secondary">
          Back to customers
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-6">
          {/* ---- balance ---- */}
          <section className="card p-5">
            <p className="figure-label">
              Currently owes
            </p>
            <p
              className={[
                'tabular mt-1 text-4xl font-bold',
                balance > 0 ? (isOverLimit ? 'text-red-700' : 'text-ink-900') : 'text-brand-700',
              ].join(' ')}
            >
              {formatPKR(balance)}
            </p>

            {limit !== null ? (
              <p className={`mt-2 text-sm ${isOverLimit ? 'text-red-700' : 'text-ink-600'}`}>
                Credit limit {formatPKR(limit)}
                {isOverLimit ? ` — over by ${formatPKR(balance - limit)}` : ''}
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No credit limit set.</p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-ink-200 pt-4">
              <div>
                <dt className="figure-label">
                  Fuel taken
                </dt>
                <dd className="tabular mt-0.5 text-lg font-semibold text-ink-900">
                  {formatPKR(statement.total_debits)}
                </dd>
              </div>
              <div>
                <dt className="figure-label">
                  Paid back
                </dt>
                <dd className="tabular mt-0.5 text-lg font-semibold text-ink-900">
                  {formatPKR(statement.total_credits)}
                </dd>
              </div>
            </dl>
          </section>

          {/* ---- lifetime fuel ---- */}
          {statement.fuel_taken?.length > 0 ? (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold text-ink-900">Fuel taken in total</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {statement.fuel_taken.map((row) => (
                  <div
                    key={row.fuel_type}
                    className={`rounded-lg p-3 ${
                      row.fuel_type === 'petrol' ? 'bg-sky-50' : 'bg-amber-50'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        row.fuel_type === 'petrol' ? 'text-sky-800' : 'text-amber-900'
                      }`}
                    >
                      {row.fuel_type === 'petrol' ? 'Petrol' : 'Diesel'}
                    </p>
                    <p className="tabular mt-1 text-xl font-bold text-ink-900">
                      {formatLitres(row.litres)}
                    </p>
                    <p className="tabular text-sm text-ink-600">{formatPKR(row.amount)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ---- history ---- */}
          <section>
            <h2 className="section-heading">
              Transaction history
            </h2>
            <CustomerLedgerTable entries={entries} />

            <Pager
              page={page}
              perPage={PER_PAGE}
              total={entryCount}
              hrefFor={(n) => `/admin/customers/${id}?page=${n}`}
              label="Ledger pages"
            />
          </section>
        </div>

        {/* ---- side forms ---- */}
        <div className="space-y-6">
          <PaymentForm customerId={customer.id} balance={balance} />

          {profile.role === ROLES.SUPER_ADMIN ? (
            <LedgerAdjustmentForm customerId={customer.id} balance={balance} />
          ) : null}

          <p className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-600">
            Fuel taken on credit reaches this ledger by itself, from the readings screen. Nothing
            here is ever edited or deleted — a mistake is corrected with a new entry pointing the
            other way, so the history always adds up.
          </p>
        </div>
      </div>
    </>
  );
}
