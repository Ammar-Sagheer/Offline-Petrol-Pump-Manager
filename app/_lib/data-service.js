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

export async function getFuelPrices() {
  return withDb((client) =>
    rows(
      client,
      'select * from fuel_prices order by effective_from desc limit 50',
      [],
      'the fuel prices',
    ),
  );
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

export async function getPurchases({ limit = 100 } = {}) {
  return withDb((client) =>
    rows(
      client,
      `select fp.*,
              jsonb_build_object('id', t.id, 'name', t.name, 'fuel_type', t.fuel_type) as tank
         from fuel_purchases fp
         join tanks t on t.id = fp.tank_id
        order by fp.purchase_date desc, fp.created_at desc
        limit $1`,
      [limit],
      'the fuel purchases',
    ),
  );
}

// ---------------------------------------------------------------------------
// Stock checks
// ---------------------------------------------------------------------------

export async function getStockChecks({ limit = 60 } = {}) {
  return withDb((client) =>
    rows(
      client,
      `select sc.*,
              jsonb_build_object('id', t.id, 'name', t.name, 'fuel_type', t.fuel_type) as tank
         from stock_checks sc
         join tanks t on t.id = sc.tank_id
        order by sc.check_date desc
        limit $1`,
      [limit],
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

export async function getLedgerEntries(customerId, { limit = 500 } = {}) {
  return withDb((client) =>
    rows(
      client,
      `select * from ledger_entries
        where customer_id = $1
        order by entry_date desc, created_at desc
        limit $2`,
      [customerId, limit],
      'the ledger entries',
    ),
  );
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

export async function getExpenses({ limit = 100 } = {}) {
  return withDb((client) =>
    rows(
      client,
      'select * from expenses order by expense_date desc limit $1',
      [limit],
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
