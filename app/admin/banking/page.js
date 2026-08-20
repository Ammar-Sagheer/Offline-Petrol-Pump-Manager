import { requirePageRole, ROLES, formatDate, formatPKR } from '@/app/_lib/helpers';
import { getBankAccounts, getBankTransactions } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import { StatTile, StatGrid } from '@/app/_components/admin/AdminStats';
import BankAccountForm from '@/app/_components/admin/BankAccountForm';
import BankTransactionForm from '@/app/_components/admin/BankTransactionForm';
import DeleteBankAccountButton from '@/app/_components/admin/DeleteBankAccountButton';
import DeleteBankTransactionButton from '@/app/_components/admin/DeleteBankTransactionButton';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';

export const metadata = { title: 'Banking' };

/**
 * The owner's bank accounts: what has gone in, what has gone out, what is left.
 *
 * Cash from the pump is paid into a bank account and pump costs are paid back
 * out of it by transfer. Nothing else in the app knows about that money, so
 * without this page the only record of it is the bank's own statement.
 *
 * Owner only. Staff record readings and deliveries; what is in the account is
 * not theirs to see, the same way expenses already are not.
 */
const PER_PAGE = 25;

export default async function BankingPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);
  const page = pageFrom(await searchParams);

  const [accounts, transactions] = await Promise.all([
    getBankAccounts(),
    getBankTransactions(),
  ]);

  const totals = accounts.reduce(
    (acc, account) => ({
      balance: acc.balance + Number(account.balance ?? 0),
      deposited: acc.deposited + Number(account.total_deposited ?? 0),
      paid: acc.paid + Number(account.total_paid ?? 0),
    }),
    { balance: 0, deposited: 0, paid: 0 },
  );

  const countsByAccount = transactions.reduce((acc, txn) => {
    acc[txn.account_id] = (acc[txn.account_id] ?? 0) + 1;
    return acc;
  }, {});

  /*
   * Sliced rather than paged in Postgres: the per-account counts above are
   * worked out from every transaction, and a database page would turn "14
   * transactions" into "however many of them are on this screen".
   */
  const pageTransactions = transactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <PageHeader
        title="Banking"
        description="Money paid into the bank, and what has been paid out of it for the pump."
      >
        {/* Adding an account is a page-level job done twice and then rarely
            again, so it belongs up here as one button rather than as a form
            standing open all day next to the one used every week. */}
        {accounts.length > 0 ? <BankAccountForm /> : null}
      </PageHeader>

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add the accounts the pump's money passes through. Once one exists you can record cash paid in and transfers paid out."
        >
          <BankAccountForm trigger="empty" />
        </EmptyState>
      ) : (
        <>
          {/* Across every account, because the question the owner actually asks
              is how much money there is, not how it is split. */}
          <section aria-label="Across all accounts" className="mb-6">
            <StatGrid columns={3}>
              <StatTile
                icon="banking"
                label="Balance now"
                value={formatPKR(totals.balance)}
                tone={totals.balance < 0 ? 'negative' : 'default'}
              />
              <StatTile
                icon="cash"
                label="Paid in, all time"
                value={formatPKR(totals.deposited)}
              />
              <StatTile
                icon="expenses"
                label="Paid out, all time"
                value={formatPKR(totals.paid)}
              />
            </StatGrid>
          </section>

          <h2 className="section-heading">Accounts</h2>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                transactionCount={countsByAccount[account.id] ?? 0}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
            <BankTransactionForm accounts={accounts} />

            <div>
              <h2 className="section-heading">
                Transactions
              </h2>

              {/* Says so plainly rather than letting rows vanish unexplained. */}
              <p className="mb-3 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-600">
                The last <span className="font-semibold text-ink-900">60</span> transactions per
                account are kept here. Older ones drop off as new ones arrive, and their amounts
                stay counted in the balances above. Download the month’s report to keep the
                detail.
              </p>

              {transactions.length === 0 ? (
                <EmptyState
                  title="Nothing recorded yet"
                  description="Record the first deposit or payment using the form."
                />
              ) : (
                <div className="card table-scroll">
                  <table className="w-full min-w-[44rem]">
                    <thead className="border-b border-ink-200 bg-ink-50">
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Account</th>
                        <th className="th">What for</th>
                        <th className="th text-right">In</th>
                        <th className="th text-right">Out</th>
                        <th className="th" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {pageTransactions.map((txn) => {
                        const isDeposit = txn.txn_type === 'deposit';
                        return (
                          <tr key={txn.id}>
                            <td className="td whitespace-nowrap">{formatDate(txn.txn_date)}</td>
                            <td className="td">{txn.account?.account_label ?? '—'}</td>
                            <td className="td">
                              <span>{txn.category ?? (isDeposit ? 'Cash paid in' : '—')}</span>
                              {txn.note ? (
                                <span className="block text-sm text-ink-600">{txn.note}</span>
                              ) : null}
                            </td>
                            {/* The arrow is the second cue beside the colour,
                                per the icons rule - green-vs-amber alone is
                                what a colourblind reader cannot use, and the
                                two columns are otherwise identical in shape. */}
                            <td className="td-num font-semibold text-brand-700">
                              {isDeposit ? (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyIn" className="h-4 w-4" />
                                  {formatPKR(txn.amount)}
                                </span>
                              ) : (
                                ''
                              )}
                            </td>
                            <td className="td-num font-semibold text-amber-800">
                              {isDeposit ? (
                                ''
                              ) : (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyOut" className="h-4 w-4" />
                                  {formatPKR(txn.amount)}
                                </span>
                              )}
                            </td>
                            <td className="td text-right">
                              <DeleteBankTransactionButton
                                transactionId={txn.id}
                                summary={`${formatPKR(txn.amount)} on ${formatDate(txn.txn_date)}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {transactions.length > 0 ? (
                <Pager
                  page={page}
                  perPage={PER_PAGE}
                  total={transactions.length}
                  hrefFor={(n) => `/admin/banking?page=${n}`}
                  label="Transaction pages"
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AccountCard({ account, transactionCount }) {
  const balance = Number(account.balance ?? 0);

  return (
    <div className="card p-4">
      {/* The bank mark sits in the same tinted ring the stat tiles use, so an
          account card reads as a sibling of the figures above it rather than
          as a plain block of text. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Slate, matching the ring the Banking stat tile above it wears.
              Both were indigo until the palette audit: a bank icon already
              says "bank", so the hue was decoration rather than meaning -
              see RING_COLORS in AdminStats.js. */}
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600"
            aria-hidden="true"
          >
            <Icon name="banking" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-ink-900">{account.account_label}</h3>
            <p className="truncate text-sm text-ink-600">
              {account.bank_name}
              {account.account_number ? ` · ${account.account_number}` : ''}
            </p>
          </div>
        </div>
        <DeleteBankAccountButton
          accountId={account.id}
          label={account.account_label}
          transactionCount={transactionCount}
        />
      </div>

      <p className="mt-4 figure-label">Balance</p>
      {/* Red when overdrawn. A negative balance here means the books say more
          has gone out than went in, which is worth noticing immediately. */}
      <p
        className={`tabular whitespace-nowrap text-2xl font-bold ${balance < 0 ? 'text-red-700' : 'text-ink-900'}`}
      >
        {formatPKR(balance)}
      </p>

      {/* Paid in and paid out get their own tinted panels rather than two bare
          figures under a hairline. They are the two directions money moves,
          and the colour carried a lot of that difference on its own before -
          a green figure beside an amber one, both at 12px. The panel gives
          each one an edge, and the label sits at the app's 12px floor rather
          than below it. */}
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-brand-50 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-brand-800">Paid in</dt>
          <dd className="tabular whitespace-nowrap text-base font-bold text-brand-700">
            {formatPKR(account.total_deposited)}
          </dd>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-amber-900">Paid out</dt>
          <dd className="tabular whitespace-nowrap text-base font-bold text-amber-800">
            {formatPKR(account.total_paid)}
          </dd>
        </div>
      </dl>

      {/* An account can only be below zero from before this rule existed, or
          from a deposit being deleted. Either way it is stuck until it is put
          right, so it says how rather than just showing red. */}
      {balance < 0 ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Overdrawn. Nothing can be paid out of this account until it is back to zero — pay money
          in, or delete the payment that caused it.
        </p>
      ) : null}

      {account.pruned_count > 0 ? (
        <p className="mt-3 text-sm text-ink-600">
          {account.pruned_count} older transaction{account.pruned_count === 1 ? '' : 's'} have
          dropped off the list. Their amounts are still counted above.
        </p>
      ) : null}
    </div>
  );
}

