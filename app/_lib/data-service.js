/**
 * Every read query in the app lives here.
 *
 * Rules:
 *   - server only, always through the session-bound connection, so RLS applies
 *   - anything that aggregates goes through a Postgres RPC rather than pulling
 *     rows into JavaScript and adding them up here
 *   - these throw on failure; pages let the error boundary handle it
 */
import 'server-only';
import { withUser } from './db';
import { getSessionProfile } from './auth';
import { todayISO } from './date-helpers';

/** Every read runs with the signed-in user's id set, so RLS applies as them. */
async function withDb(fn) {
  const profile = await getSessionProfile();
  return withUser(profile?.id ?? null, fn);
}

async function rows(client, sql, params, what) {
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (error) {
    throw new Error(`Could not load ${what}: ${error.message}`);
  }
}

async function one(client, sql, params, what) {
  const result = await rows(client, sql, params, what);
  return result[0] ?? null;
}

// ---------------------------------------------------------------------------
// Configuration: tanks, nozzles, prices
// ---------------------------------------------------------------------------

export async function getTanks() {
  return withDb((client) =>
    rows(client, 'select * from tanks order by fuel_type', [], 'the tanks'),
  );
}

export async function getNozzles() {
  return withDb((client) =>
    rows(
      client,
      `select n.*,
              jsonb_build_object('id', t.id, 'name', t.name, 'fuel_type', t.fuel_type) as tank
         from nozzles n
         join tanks t on t.id = n.tank_id
        order by n.unit_number, n.nozzle_label`,
      [],
      'the nozzles',
    ),
  );
}

/**
 * The most recent rate changes, for the panel on Settings.
 *
 * A ROW CAP THAT CUTS ON A DATE BOUNDARY, never inside one. This was seven
 * whole days before, because a plain `limit` would show diesel's new rate for
 * a day and leave petrol's off the bottom, and the two are read as a pair -
 * the owner checks that both moved. Seven days is fourteen rows though, which
 * is a scrolling wall in a panel meant to be glanced at; five is the glance.
 *
 * So: keep rows until there are `maxRows`, then keep going only while the date
 * has not changed. The panel shows five or six rows rather than exactly five,
 * and a day is never half-told. "View all rates" holds the rest.
 *
 * The overfetch is what makes one round trip enough: 60 rows leaves room for a
 * day that was corrected several times over without a second query.
 */
export async function getRecentFuelPrices(maxRows = 5) {
  const recent = await withDb((client) =>
    rows(
      client,
      // Matches the full history page, so a day's pair always reads in the
      // same order in both places rather than in whatever order it was saved.
      `select * from fuel_prices
        order by effective_from desc, fuel_type
        limit 60`,
      [],
      'the fuel prices',
    ),
  );

  const kept = [];
  for (const row of recent) {
    if (kept.length >= maxRows && row.effective_from !== kept.at(-1).effective_from) break;
    kept.push(row);
  }
  return kept;
}

/**
 * One page of the full rate history, plus how many there are in total.
 *
 * The total rides along on the same query as a window function, the way
 * PostgREST's `count: 'exact'` did for the reference app - the pager needs it,
 * and asking separately would be a second round trip for a number this query
 * has already had to establish.
 */
export async function getFuelPricesPage({ page = 1, perPage = 25 } = {}) {
  const offset = (page - 1) * perPage;

  return withDb(async (client) => {
    const result = await rows(
      client,
      `select *, count(*) over () as total_count
         from fuel_prices
        order by effective_from desc, fuel_type
        limit $1 offset $2`,
      [perPage, offset],
      'the fuel prices',
    );
    return {
      rows: result.map(({ total_count, ...row }) => row),
      total: Number(result[0]?.total_count ?? 0),
    };
  });
}

/**
 * One page of the activity trail, newest first, plus how many there are.
 *
 * Nothing is joined and nothing is looked up: every line was written as a
 * finished sentence by the trigger in migration 024, at the moment the change
 * happened. That is not a shortcut, it is the requirement - half these lines
 * describe rows that no longer exist, and a join would render them as blanks.
 *
 * There is no role check here because the row-level policy is the check: only
 * a super_admin can select from this table at all, so a staff login asking for
 * it gets an empty page rather than somebody else's day.
 *
 * `who` narrows to one person, which is the question actually asked of a log:
 * not "what happened to this row" but "what did they do". It matches a column
 * the log holds itself, so filtering does not need another table either.
 */
export async function getActivityLog({ page = 1, perPage = 20, who } = {}) {
  const offset = (page - 1) * perPage;

  return withDb(async (client) => {
    const result = await rows(
      client,
      `select *, count(*) over () as total_count
         from activity_log
        where ($3::uuid is null or actor_id = $3::uuid)
        order by occurred_at desc, id desc
        limit $1 offset $2`,
      [perPage, offset, who ?? null],
      'the activity log',
    );
    return {
      rows: result.map(({ total_count, ...row }) => row),
      total: Number(result[0]?.total_count ?? 0),
    };
  });
}

/**
 * The rate in force for each fuel, as { petrol: 280, diesel: 275 }.
 *
 * The date is always sent explicitly rather than left to the database default,
 * so the app and Postgres cannot disagree about which day it is.
 */
export async function getCurrentRates(onDate) {
  const date = onDate ?? todayISO();

  return withDb(async (client) => {
    const rates = {};
    for (const fuelType of ['petrol', 'diesel']) {
      const value = await one(
        client,
        'select current_fuel_rate($1, $2) as rate',
        [fuelType, date],
        `the ${fuelType} rate`,
      );
      rates[fuelType] = value?.rate === null || value?.rate === undefined ? null : Number(value.rate);
    }
    return rates;
  });
}

// ---------------------------------------------------------------------------
// Daily readings
// ---------------------------------------------------------------------------

/**
 * The whole daily entry screen in one call: every nozzle with its opening
 * reading prefilled, the rate for the day, and anything already entered.
 */
export async function getReadingSheet(date) {
  return withDb((client) =>
    rows(client, 'select * from get_reading_sheet($1)', [date], "the day's reading sheet"),
  );
}

/**
 * Credit slips for a set of readings, keyed by reading id.
 */
export async function getCreditSalesForReadings(readingIds = []) {
  if (readingIds.length === 0) return {};

  return withDb(async (client) => {
    const result = await rows(
      client,
      `select cs.*,
              jsonb_build_object('id', c.id, 'name', c.name, 'vehicle_number', c.vehicle_number) as customer
         from credit_sales cs
         join customers c on c.id = cs.customer_id
        where cs.reading_id = any($1::uuid[])`,
      [readingIds],
      'the credit slips',
    );

    return result.reduce((byReading, row) => {
      (byReading[row.reading_id] ||= []).push(row);
      return byReading;
    }, {});
  });
}

export async function getRecentReadings(limit = 60) {
  return withDb((client) =>
    rows(
      client,
      `select nr.*,
              jsonb_build_object(
                'unit_number', n.unit_number, 'nozzle_label', n.nozzle_label,
                'tank', jsonb_build_object('fuel_type', t.fuel_type)
              ) as nozzle
         from nozzle_readings nr
         join nozzles n on n.id = nr.nozzle_id
         join tanks t on t.id = n.tank_id
        order by nr.reading_date desc, nr.created_at desc
        limit $1`,
      [limit],
      'the recent readings',
    ),
  );
}

// ---------------------------------------------------------------------------
// Fuel purchases
// ---------------------------------------------------------------------------

/*
 * Every fuel delivery, uncapped.
 *
 * It used to stop at 100, which quietly broke the figure that matters most on
 * that screen: the Purchases page adds up what is still owed to suppliers ACROSS
 * ALL ROWS, so once the hundred-and-first delivery was recorded the oldest
 * unpaid ones dropped out of the sum and the pump under-reported its own debt.
 * A cap on a list you are going to total is a cap on the total.
 *
 * The page shows a page at a time - see Pager - but it needs the whole set to
 * work the total out from. Deliveries are a handful a week, so this stays small
 * for years; if it ever does not, the pending total wants its own aggregate
 * query before this cap comes back.
 */
export async function getPurchases() {
  return withDb((client) =>
    rows(
      client,
      `select fp.*,
              jsonb_build_object('id', t.id, 'name', t.name, 'fuel_type', t.fuel_type) as tank
         from fuel_purchases fp
         join tanks t on t.id = fp.tank_id
        order by fp.purchase_date desc, fp.created_at desc`,
      [],
      'the fuel purchases',
    ),
  );
}

// ---------------------------------------------------------------------------
// Lubricants
//
// The shelf of engine oil and the rest: the products, what comes in from the
// distributor, and what goes out over the counter. Everything is measured in
// litres, whether it left as a sealed 4 L carton or as 250 ml poured loose.
// ---------------------------------------------------------------------------

/** The product list. Retired products are left out unless asked for. */
export async function getLubricants({ includeRetired = false } = {}) {
  return withDb((client) =>
    rows(
      client,
      `select * from lubricants
        where ($1::boolean or is_active)
        order by name`,
      [includeRetired],
      'the lubricants',
    ),
  );
}

/**
 * The shelf as at a date: bought, sold and what is left, per product.
 *
 * Aggregated in Postgres like every other stock figure, so the Stock page and
 * the monthly report cannot arrive at different answers.
 */
export async function getLubricantStock(date) {
  return withDb((client) =>
    rows(
      client,
      'select * from get_lubricant_stock($1)',
      [date ?? todayISO()],
      'the lubricant stock',
    ),
  );
}

/** One day of counter sales with its totals - the whole Lubricants screen. */
export async function getLubricantDay(date) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select get_lubricant_day($1) as day',
      [date ?? todayISO()],
      "the day's lubricant sales",
    );
    return result?.day ?? null;
  });
}

/** The other half of the Purchases page, uncapped for the same reason. */
export async function getLubricantPurchases() {
  return withDb((client) =>
    rows(
      client,
      `select lp.*,
              jsonb_build_object(
                'id', l.id, 'name', l.name,
                'pack_size_litres', l.pack_size_litres, 'sold_loose', l.sold_loose
              ) as lubricant
         from lubricant_purchases lp
         join lubricants l on l.id = lp.lubricant_id
        order by lp.purchase_date desc, lp.created_at desc`,
      [],
      'the lubricant purchases',
    ),
  );
}

// ---------------------------------------------------------------------------
// Stock checks
// ---------------------------------------------------------------------------

/*
 * Every dip that has been recorded, uncapped.
 *
 * The Stock page looks up THE CHECK FOR THE DATE ON SCREEN in this list, so a
 * cap meant stepping back far enough made the page believe an older day had
 * never been checked - and offer to record it again. Same shape of bug as the
 * purchases cap: the list is not only a list, something is derived from it.
 */
export async function getStockChecks() {
  return withDb((client) =>
    rows(
      client,
      `select sc.*,
              jsonb_build_object('id', t.id, 'name', t.name, 'fuel_type', t.fuel_type) as tank
         from stock_checks sc
         join tanks t on t.id = sc.tank_id
        order by sc.check_date desc`,
      [],
      'the stock checks',
    ),
  );
}

/** What the books say should be in a tank at the end of a given date. */
export async function getExpectedStock(tankId, date) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select calculate_expected_stock($1, $2) as expected',
      [tankId, date],
      'the expected stock',
    );
    return result?.expected === null || result?.expected === undefined
      ? null
      : Number(result.expected);
  });
}

/** Expected stock for every tank on a date, ready for the stock check form. */
export async function getExpectedStockForAllTanks(date) {
  const tanks = await getTanks();
  return Promise.all(
    tanks.map(async (tank) => ({
      ...tank,
      expected_stock: await getExpectedStock(tank.id, date),
    })),
  );
}

// ---------------------------------------------------------------------------
// Customers and the ledger
// ---------------------------------------------------------------------------

export async function getCustomers() {
  return withDb((client) =>
    rows(
      client,
      'select * from customers where is_active order by name',
      [],
      'the customers',
    ),
  );
}

/** Every customer with their outstanding balance - one query, not one each. */
export async function getCustomerBalances() {
  return withDb((client) =>
    rows(client, 'select * from get_customer_balances()', [], 'the customer balances'),
  );
}

/**
 * The customers taken off the list.
 *
 * get_customer_balances returns only active ones - that is the working list,
 * and the figure the Customers page totals. This is the other half, so
 * "removed" never means "lost": a retired account can always be found and
 * brought back, and its balance comes along so a non-zero one cannot hide
 * behind is_active.
 */
export async function getRetiredCustomers() {
  return withDb((client) =>
    rows(client, 'select * from get_retired_customers()', [], 'the removed customers'),
  );
}

export async function getCustomerStatement(customerId) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select get_customer_statement($1) as statement',
      [customerId],
      'the customer statement',
    );
    return result?.statement ?? null;
  });
}

/*
 * One customer's ledger, a page at a time.
 *
 * Paged in the DATABASE rather than fetched whole and sliced, unlike purchases
 * and stock checks: nothing on the customer page is derived from these rows.
 * The balance and the fuel/lubricant breakdown come from get_customer_statement,
 * which sums in Postgres over everything. So the list is only ever a list, and
 * there is no reason to carry rows the screen will not show.
 *
 * A regular haulier can run to hundreds of entries a year, which is what makes
 * this the one growing table worth paging properly.
 */
export async function getLedgerEntriesPage(customerId, { page = 1, perPage = 25 } = {}) {
  const offset = (page - 1) * perPage;

  return withDb(async (client) => {
    const result = await rows(
      client,
      `select *, count(*) over () as total_count
         from ledger_entries
        where customer_id = $1
        order by entry_date desc, created_at desc
        limit $2 offset $3`,
      [customerId, perPage, offset],
      'the ledger entries',
    );
    return {
      rows: result.map(({ total_count, ...row }) => row),
      total: Number(result[0]?.total_count ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Dashboard and reports - all aggregated in Postgres
// ---------------------------------------------------------------------------

export async function getDailySummary(date) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select get_daily_summary($1) as summary',
      [date],
      "the day's summary",
    );
    return result?.summary ?? null;
  });
}

export async function getSalesTrend(from, to) {
  return withDb((client) =>
    rows(client, 'select * from get_sales_trend($1, $2)', [from, to], 'the sales trend'),
  );
}

/**
 * The same date spine as getSalesTrend, for the oil side: what the shelf took
 * and what the drum took, per day.
 *
 * Its own RPC rather than more columns on get_sales_trend, which two screens
 * read and neither of which wants these - see migration 018.
 */
export async function getLubricantTrend(from, to) {
  return withDb((client) =>
    rows(
      client,
      'select * from get_lubricant_trend($1, $2)',
      [from, to],
      'the lubricant sales trend',
    ),
  );
}

/**
 * The first day the pump traded, or null if it never has.
 *
 * The daily history pages backwards from today, so it needs to know where to
 * stop - otherwise the pager would run on into empty days forever. Fuel and
 * lubricants are both asked, because a day selling only oil is still a day.
 */
export async function getFirstTradingDay() {
  return withDb(async (client) => {
    const result = await one(
      client,
      `select least(
                (select min(reading_date) from nozzle_readings),
                (select min(sale_date)    from lubricant_sales)
              ) as day`,
      [],
      'the first trading day',
    );
    return result?.day ?? null;
  });
}

export async function getMonthlyReport(year, month) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select get_monthly_report($1, $2) as report',
      [year, month],
      'the monthly report',
    );
    return result?.report ?? null;
  });
}

export async function getMonthExport(year, month) {
  return withDb(async (client) => {
    const result = await one(
      client,
      'select get_month_export($1, $2) as export',
      [year, month],
      'the month export',
    );
    return result?.export ?? null;
  });
}

// ---------------------------------------------------------------------------
// Expenses and staff accounts (super_admin only - RLS enforces it)
// ---------------------------------------------------------------------------

/**
 * The recorded expenses, newest first.
 *
 * `from`/`to` are inclusive ISO dates - the Expenses page passes the month on
 * screen, so its table and its totals describe the same set of rows. Left out,
 * it returns the most recent ones regardless of month.
 */
export async function getExpenses({ from, to, limit = 100 } = {}) {
  return withDb((client) =>
    rows(
      client,
      `select * from expenses
        where ($2::date is null or expense_date >= $2::date)
          and ($3::date is null or expense_date <= $3::date)
        order by expense_date desc
        limit $1`,
      [limit, from ?? null, to ?? null],
      'the expenses',
    ),
  );
}

export async function getProfiles() {
  return withDb((client) =>
    rows(
      client,
      'select id, email, full_name, role, is_active, created_at from profiles order by full_name',
      [],
      'the staff accounts',
    ),
  );
}

export async function anyProfilesExist() {
  return withUser(null, async (client) => {
    const result = await one(
      client,
      'select any_profiles_exist() as exists_row',
      [],
      'setup state',
    );
    return Boolean(result?.exists_row);
  });
}

// ---------------------------------------------------------------------------
// Banking
//
// The owner's own accounts: cash paid in, pump costs paid out by transfer.
// Owner only - the RLS policies refuse a data_entry caller outright.
// ---------------------------------------------------------------------------

/** Each account with its balance and lifetime totals, from the view. */
export async function getBankAccounts() {
  return withDb((client) =>
    rows(
      client,
      'select * from bank_account_balances order by created_at',
      [],
      'the bank accounts',
    ),
  );
}

/**
 * The transactions on screen.
 *
 * No limit is passed by the page and none is needed: the database keeps at most
 * 60 rows per account, so "everything there is" is already a small number.
 */
export async function getBankTransactions() {
  return withDb((client) =>
    rows(
      client,
      `select bt.*,
              jsonb_build_object(
                'id', ba.id, 'bank_name', ba.bank_name, 'account_label', ba.account_label
              ) as account
         from bank_transactions bt
         join bank_accounts ba on ba.id = bt.account_id
        order by bt.txn_date desc, bt.created_at desc`,
      [],
      'the bank transactions',
    ),
  );
}
