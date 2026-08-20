import Link from 'next/link';

import { requirePageRole, ROLES, formatPKR } from '@/app/_lib/helpers';
import { getCustomerBalances, getRetiredCustomers } from '@/app/_lib/data-service';
import { customerAvatar } from '@/app/_lib/customer-avatar';
import PageHeader from '@/app/_components/ui/PageHeader';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import EmptyState from '@/app/_components/ui/EmptyState';
import CustomerForm from '@/app/_components/admin/CustomerForm';
import CustomerSearch from '@/app/_components/admin/CustomerSearch';
import RemoveCustomerButton, {
  RestoreCustomerButton,
  PurgeCustomerButton,
} from '@/app/_components/admin/RemoveCustomerButton';

export const metadata = { title: 'Customers' };

/**
 * The name cell, and the reason it is its own thing now.
 *
 * The bubble carries the customer's INITIALS. It has been a single letter, an
 * icon, and now two letters - see customer-avatar.js for why the icon version
 * did not survive contact with a long list.
 *
 * ONE CELL INSTEAD OF TWO COLUMNS. The vehicle used to be a column of its own,
 * which spent a whole column's width on a field that is blank for a good share
 * of customers and is only ever read as "which of the two Ahmads is this".
 * Sitting under the name it does that job better and gives the table one fewer
 * column to fit before it starts scrolling sideways - the same move the
 * Ramtabs reference makes with its vendor column.
 */
function CustomerCell({ customer, muted = false }) {
  const avatar = customerAvatar(customer);

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          muted ? 'bg-ink-100 text-ink-400' : `${avatar.bg} ${avatar.text}`
        }`}
        aria-hidden="true"
      >
        {avatar.initials}
      </span>
      <div className="min-w-0">
        <Link
          href={`/admin/customers/${customer.customer_id}`}
          className={`block truncate font-semibold hover:underline ${
            muted ? 'text-ink-600' : 'text-brand-700'
          }`}
        >
          {customer.name}
        </Link>
        {/* Never "—" here. A dash under a name reads as a missing value the
            reader should go and fix; a customer with no vehicle on file is
            simply a customer with no vehicle, so the line is absent instead. */}
        {customer.vehicle_number ? (
          <span className="tabular block truncate text-sm text-ink-500">
            {customer.vehicle_number}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Name, vehicle and phone, matched case-insensitively on a plain substring.
 *
 * FILTERED IN JAVASCRIPT, NOT IN POSTGRES, and that is a deliberate limit
 * rather than an oversight. `get_customer_balances` returns every active
 * account in one call because the page totals them all anyway - the figures at
 * the top are sums over the whole list, not over what is on screen. Filtering
 * here keeps those totals honest and costs one pass over an array that is a
 * few hundred rows at the outside. If this pump ever has thousands of credit
 * accounts, the search belongs in the RPC and the totals need their own query
 * - the note in the skill about capping a list you are going to total is the
 * same trap seen from the other side.
 */
function matches(customer, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [customer.name, customer.vehicle_number, customer.phone]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export default async function CustomersPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const params = await searchParams;
  const query = typeof params?.q === 'string' ? params.q.trim() : '';

  // Removed customers are only fetched for the owner, who is the only one who
  // can act on them - staff would get a list they cannot use.
  const [customers, retired] = await Promise.all([
    getCustomerBalances(),
    isOwner ? getRetiredCustomers() : Promise.resolve([]),
  ]);

  /* The TILES COUNT EVERY ACCOUNT, the table shows the matches. A search that
     silently changed "total outstanding" into "total outstanding among rows
     matching 'ahm'" would be a figure that looks like the headline and is not
     - the same reason the Company Assets tiles come from a summary RPC rather
     than from the nine rows on screen. */
  const visible = customers.filter((customer) => matches(customer, query));

  const balances = customers.map((customer) => Math.max(0, Number(customer.balance)));
  const totalOwed = balances.reduce((total, balance) => total + balance, 0);
  const owingNow = balances.filter((balance) => balance > 0).length;
  const largest = balances.length > 0 ? Math.max(...balances) : 0;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Credit accounts and what each one currently owes."
      />

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add the people who take fuel on credit. Once they exist you can attach them to credit slips on the readings screen."
        >
          <CustomerForm />
        </EmptyState>
      ) : (
        <>
          {/*
           * FOUR FIGURES, AND "OVER THEIR LIMIT" IS NOT ONE OF THEM ANY MORE -
           * the owner asked for it to go. What replaced it is the same question
           * asked in a way that does not depend on a limit being set at all:
           * how many owe anything right now, and how big the biggest single
           * debt is. Most accounts here have no credit limit on file, so a
           * count of who is over one was a figure about the minority of rows
           * that happened to have the field filled in.
           */}
          <div className="mb-6">
            <StatGrid>
              <StatTile
                icon="credit"
                label="Total outstanding"
                value={formatPKR(totalOwed)}
                sub={`across ${customers.length} account${customers.length === 1 ? '' : 's'}`}
              />
              <StatTile icon="customers" label="On the list" value={String(customers.length)} />
              <StatTile
                icon="account"
                label="Owing right now"
                value={String(owingNow)}
                sub={
                  customers.length > 0
                    ? `${Math.round((owingNow / customers.length) * 100)}% of accounts`
                    : null
                }
              />
              <StatTile icon="moneyOut" label="Largest balance" value={formatPKR(largest)} />
            </StatGrid>
          </div>

          {/*
           * THE TABLE OWNS ITS OWN HEADER BAR - title on the left, search and
           * "Add a customer" on the right - instead of the button sitting up in
           * the PageHeader. The owner asked for this arrangement, and it is the
           * better one here for a reason worth keeping: search and Add both act
           * on the TABLE, and a control that acts on a table belongs against
           * that table rather than against the page title, where it reads as
           * applying to everything below it including the Removed list.
           */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
              <h2 className="text-base font-bold text-ink-900">
                All customers{' '}
                <span className="tabular font-semibold text-ink-500">({visible.length})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <CustomerSearch />
                <CustomerForm />
              </div>
            </div>

            <div className="table-scroll">
              <table className="w-full min-w-[44rem]">
                {/*
                 * RULED IN BOTH DIRECTIONS, at the owner's request. Vertical
                 * dividers are usually the wrong call - they add ink that
                 * whitespace already provides - but they earn their place once a
                 * row carries five short fields of the same visual weight
                 * (initials, name, vehicle, phone, two money columns), which is
                 * exactly when the eye starts sliding between neighbouring cells
                 * on a wide row. The lines are `ink-200` hairlines, not borders:
                 * enough to guide, not enough to cage.
                 */}
                <thead className="border-b border-ink-200 bg-ink-50">
                  <tr className="divide-x divide-ink-200">
                    <th className="th">Customer</th>
                    <th className="th">Phone</th>
                    <th className="th text-right">Credit limit</th>
                    <th className="th text-right">Owes</th>
                    {isOwner ? (
                      <th className="th">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {visible.map((customer) => {
                    const balance = Number(customer.balance);
                    const limit =
                      customer.credit_limit === null ? null : Number(customer.credit_limit);
                    const isOverLimit = limit !== null && balance > limit;
                    const used = limit !== null && limit > 0 ? (balance / limit) * 100 : null;

                    return (
                      <tr
                        key={customer.customer_id}
                        className="divide-x divide-ink-200 hover:bg-ink-50"
                      >
                        <td className="td">
                          <CustomerCell customer={customer} />
                        </td>

                        {/* `tel:` rather than plain text - this list is read on a
                          tablet standing at the pump, and the reason to look up
                          a number is almost always to ring it. */}
                        <td className="td whitespace-nowrap">
                          {customer.phone ? (
                            <a
                              href={`tel:${String(customer.phone).replace(/\s+/g, '')}`}
                              className="tabular font-medium text-ink-700 hover:text-brand-700 hover:underline"
                            >
                              {customer.phone}
                            </a>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>

                        {/*
                         * A BAR UNDER THE LIMIT, not a percentage beside it. How
                         * close an account is to its ceiling is a proportion, and
                         * a proportion is read off a length faster than off a
                         * number - but only where a ceiling exists. Accounts with
                         * no limit get the dash and nothing else rather than an
                         * empty track, which would imply a limit of zero.
                         *
                         * Green under, red over, and nothing in between: amber
                         * would be a third state to learn, and "approaching the
                         * limit" is not a thing anyone acts on differently from
                         * "under it". The word in the badge is what actually
                         * carries "over" - the colour is the second cue, never
                         * the only one.
                         */}
                        <td className="td-num text-ink-600">
                          {limit === null ? (
                            '—'
                          ) : (
                            <div className="ml-auto w-24">
                              <span className="tabular block">{formatPKR(limit)}</span>
                              <span
                                className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-200"
                                aria-hidden="true"
                              >
                                <span
                                  className={`block h-full rounded-full ${
                                    isOverLimit ? 'bg-red-600' : 'bg-brand-600'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, used ?? 0))}%` }}
                                />
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="td-num">
                          <span
                            className={[
                              'tabular block font-bold',
                              balance > 0
                                ? isOverLimit
                                  ? 'text-red-700'
                                  : 'text-ink-900'
                                : 'text-brand-700',
                            ].join(' ')}
                          >
                            {formatPKR(balance)}
                          </span>
                          {isOverLimit ? (
                            <span className="badge mt-1 bg-red-100 text-red-800">Over limit</span>
                          ) : null}
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

            {/* A search that matches nothing must say so inside the table, not
                leave an empty ruled box that reads as a loading state. */}
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-base text-ink-600">
                No customer matches <span className="font-semibold">“{query}”</span>.
              </p>
            ) : null}
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
            <table className="w-full min-w-[34rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Customer</th>
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
                      <CustomerCell customer={customer} muted />
                    </td>
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
