'use server';

/**
 * Every mutation in the app.
 *
 * House rules:
 *   - the FIRST line of every action is requireRole(...), no exceptions
 *   - actions return { ok, message } so forms can show the result with
 *     useActionState, rather than throwing at the user
 *   - money and litres are recomputed here from the raw inputs; whatever the
 *     browser posted for a total is treated as a hint, never as fact
 *   - the database has the final say - if a constraint refuses a write, its
 *     message is passed straight through, because those messages are the ones
 *     that actually explain what is wrong
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';

import { withUser } from './db';
import { login, logout } from './auth';
import {
  requireRole,
  ROLES,
  roundMoney,
  landingPageFor,
  fullResetAllowed,
  formatLitres,
} from './helpers';

// ---------------------------------------------------------------------------
// Small input helpers
// ---------------------------------------------------------------------------

const ok = (message) => ({ ok: true, message });
const fail = (message) => ({ ok: false, message });

function text(formData, field) {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function number(formData, field) {
  const raw = text(formData, field);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turns a database error into something worth reading.
 *
 * The check constraints and triggers were written with human-readable
 * messages precisely so they could be shown here rather than swallowed.
 * `error.constraint` is the exact constraint/index name `pg` reports for a
 * violation - more reliable than matching on message text, which is what the
 * Supabase client left us doing (its error objects didn't carry this).
 */
function describe(error, fallback) {
  if (!error) return fallback;
  const constraint = error.constraint || '';
  const message = error.message || String(error);

  if (constraint === 'nozzle_readings_split_matches_sale') {
    return 'Cash plus credit does not equal the amount sold. Check the figures and try again.';
  }
  if (constraint === 'nozzle_readings_closing_gte_opening') {
    return 'The closing reading is lower than the opening reading. A meter cannot run backwards.';
  }
  if (constraint === 'nozzle_readings_nozzle_id_reading_date_shift_key') {
    return 'This nozzle has already been entered for that date.';
  }
  if (constraint === 'stock_checks_tank_id_check_date_key') {
    return 'A stock check for that tank and date has already been recorded.';
  }
  if (constraint === 'fuel_prices_fuel_type_effective_from_key') {
    return 'A rate for that fuel and date already exists. Pick a different date to change it.';
  }
  if (message.includes('append-only')) {
    return 'The ledger cannot be edited. Post a new offsetting entry instead.';
  }
  return message || fallback;
}

/** requireRole, but returning the failure instead of throwing. */
async function requireRoleOrFail(...roles) {
  try {
    return { profile: await requireRole(...roles) };
  } catch (error) {
    return { error: fail(error.message) };
  }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function signIn(_prevState, formData) {
  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const next = text(formData, 'next');

  if (!email || !password) {
    return fail('Enter your email and password.');
  }

  const profile = await login(email, password);

  if (!profile) {
    // Deliberately vague - never reveal whether an account with that email
    // exists.
    return fail('Those details did not work. Check your email and password.');
  }

  if (!profile.is_active) {
    return fail('This account has been deactivated. Ask the owner to re-enable it.');
  }

  const destination = next && next.startsWith('/admin') ? next : landingPageFor(profile.role);

  // redirect() throws internally, so it has to sit outside any try/catch.
  redirect(destination);
}

export async function signOut() {
  await logout();
  redirect('/admin/login');
}

/**
 * Changes your OWN password. Both roles - this is not account management.
 *
 * The owner hands out a password when he creates a login, so everyone needs a
 * way to replace it with something only they know. Nobody can change anyone
 * else's here: change_password() (002_identity_and_sessions.sql) applies to
 * whoever current_uid() resolves to for this request, taken from the session,
 * never from the form - and it checks the current password itself, in SQL,
 * before touching anything.
 */
export async function changePassword(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (!currentPassword || !newPassword) {
    return fail('Fill in your current password and the new one.');
  }
  if (newPassword.length < 8) {
    return fail('The new password must be at least 8 characters.');
  }
  if (newPassword !== confirmPassword) {
    return fail('The two new passwords do not match.');
  }
  if (newPassword === currentPassword) {
    return fail('The new password is the same as the current one.');
  }

  try {
    await withUser(profile.id, (client) =>
      client.query('select change_password($1, $2)', [currentPassword, newPassword]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not change the password.'));
  }

  return ok('Password changed. Use the new one next time you sign in.');
}

// ---------------------------------------------------------------------------
// Daily nozzle readings - the core daily habit
// ---------------------------------------------------------------------------

/**
 * Saves one nozzle's day, together with its credit slips, in one transaction.
 *
 * The cash figure is derived here (total sold minus the slips) rather than
 * taken from the form, so cash can never be quietly wrong.
 */
export async function saveReading(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const nozzleId = text(formData, 'nozzle_id');
  const readingDate = text(formData, 'reading_date');
  const opening = number(formData, 'opening_reading');
  const closing = number(formData, 'closing_reading');
  const rate = number(formData, 'rate_per_litre');

  if (!nozzleId || !readingDate) return fail('Missing the nozzle or the date.');
  if (opening === null) return fail('Enter the opening reading.');
  if (closing === null) return fail('Enter the closing reading.');
  if (rate === null || rate <= 0) {
    return fail('No rate is set for this fuel. Ask the owner to set today’s price first.');
  }
  if (closing < opening) {
    return fail('The closing reading is lower than the opening reading.');
  }

  // Credit slips arrive as JSON from the form component.
  let creditLines = [];
  const rawLines = text(formData, 'credit_lines');
  if (rawLines) {
    try {
      creditLines = JSON.parse(rawLines);
    } catch {
      return fail('The credit slips could not be read. Please re-enter them.');
    }
  }

  if (!Array.isArray(creditLines)) creditLines = [];

  const cleanedLines = [];
  for (const line of creditLines) {
    const customerId = String(line?.customer_id ?? '').trim();
    const litres = Number(line?.litres);
    const amount = Number(line?.amount);

    if (!customerId) return fail('Every credit slip needs a customer.');
    if (!Number.isFinite(litres) || litres <= 0) {
      return fail('Every credit slip needs a litres figure above zero.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail('Every credit slip needs an amount above zero.');
    }

    cleanedLines.push({
      customer_id: customerId,
      litres: roundMoney(litres),
      amount: roundMoney(amount),
    });
  }

  const litresSoldValue = roundMoney(closing - opening);
  const saleAmount = roundMoney(litresSoldValue * rate);
  const creditTotal = roundMoney(cleanedLines.reduce((total, line) => total + line.amount, 0));
  const cashAmount = roundMoney(saleAmount - creditTotal);

  if (cashAmount < 0) {
    return fail(
      `The credit slips come to Rs ${creditTotal.toLocaleString()}, which is more than the ` +
        `Rs ${saleAmount.toLocaleString()} sold on this nozzle. Check the slips.`,
    );
  }

  try {
    await withUser(profile.id, (client) =>
      client.query('select create_nozzle_reading($1, $2, $3, $4, $5, $6, $7::jsonb)', [
        nozzleId,
        readingDate,
        opening,
        closing,
        rate,
        cashAmount,
        JSON.stringify(cleanedLines),
      ]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the reading.'));
  }

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');

  return ok(
    cleanedLines.length > 0
      ? `Saved. ${litresSoldValue} L sold, with ${cleanedLines.length} credit slip${
          cleanedLines.length === 1 ? '' : 's'
        } posted to the ledger.`
      : `Saved. ${litresSoldValue} L sold, all cash.`,
  );
}

/**
 * Removing a reading is a super_admin-only correction. It will be refused if
 * its credit slips have already reached the ledger - that debt has to be
 * cancelled with an offsetting entry first, so the history stays intact.
 */
export async function deleteReading(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const readingId = text(formData, 'reading_id');
  if (!readingId) return fail('Missing the reading.');

  // Goes through delete_reading() rather than deleting the row directly. That
  // function posts an offsetting ledger entry for every credit slip it takes
  // away, in the same transaction. Deleting the row straight would remove the
  // slip but leave the customer's debit standing, so they would appear to owe
  // money for fuel the books no longer show them taking.
  let data;
  try {
    const result = await withUser(profile.id, (client) =>
      client.query('select delete_reading($1) as result', [readingId]),
    );
    data = result.rows[0]?.result;
  } catch (error) {
    return fail(describe(error, 'Could not delete the reading.'));
  }

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');

  const reversed = Number(data?.slips_reversed ?? 0);
  return ok(
    reversed > 0
      ? `Reading deleted. ${reversed} credit ${reversed === 1 ? 'slip' : 'slips'} reversed on the customer ledger.`
      : 'Reading deleted.',
  );
}

/**
 * Wipes one day's nozzle entries so the day can be entered again.
 *
 * The mistake this fixes is ordinary: a day entered against the wrong date, or
 * six nozzles typed in before anyone noticed the figures were yesterday's. Left
 * alone it poisons everything downstream, because each day's opening comes from
 * the day before.
 *
 * Scope is deliberately just the nozzle entries and their credit slips. Fuel
 * deliveries, stock checks and expenses are deleted one at a time on their own
 * screens, where you can see what you are removing.
 *
 * Credit slips are reversed, not erased - clear_day posts an offsetting entry
 * for each one, so a customer's balance comes back to correct while the history
 * of what happened stays readable.
 */
export async function clearDay(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const date = text(formData, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Missing the date.');

  let data;
  try {
    const result = await withUser(profile.id, (client) =>
      client.query('select clear_day($1) as result', [date]),
    );
    data = result.rows[0]?.result;
  } catch (error) {
    return fail(describe(error, 'Could not clear the day.'));
  }

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');
  revalidatePath('/admin/reports');

  const cleared = Number(data?.readings ?? 0);
  const reversed = Number(data?.slips_reversed ?? 0);

  if (cleared === 0) return ok('There was nothing entered for that day.');

  return ok(
    reversed > 0
      ? `Cleared ${cleared} nozzle ${cleared === 1 ? 'entry' : 'entries'}, and reversed ${reversed} credit ${reversed === 1 ? 'slip' : 'slips'} on the customer ledger.`
      : `Cleared ${cleared} nozzle ${cleared === 1 ? 'entry' : 'entries'}. Enter the day again when ready.`,
  );
}

/**
 * Empties the books completely. Testing/demo scaffolding, not a feature.
 *
 * Three separate things have to be true for this to run: ALLOW_FULL_RESET must
 * be set on the server, the caller must be the owner, and they must type their
 * own password and the word RESET.
 */
export async function resetEverything(_prevState, formData) {
  if (!fullResetAllowed()) {
    return fail('Resetting everything is switched off on this build.');
  }

  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const password = String(formData.get('owner_password') ?? '');
  const confirmation = text(formData, 'confirmation');

  if (confirmation !== 'RESET') return fail('Type RESET in capitals to confirm.');
  if (!password) return fail('Enter your own password to confirm.');

  const passwordOk = await withUser(null, async (client) => {
    const { rows } = await client.query('select * from verify_login($1, $2)', [
      profile.email,
      password,
    ]);
    return Boolean(rows[0]);
  });

  if (!passwordOk) return fail('That is not your password. Nothing has been deleted.');

  let data;
  try {
    const result = await withUser(profile.id, (client) => client.query('select reset_all_data() as result'));
    data = result.rows[0]?.result;
  } catch (error) {
    return fail(describe(error, 'Could not reset the data.'));
  }

  ['/admin', '/admin/readings', '/admin/purchases', '/admin/stock-checks',
   '/admin/customers', '/admin/reports', '/admin/settings'].forEach(revalidatePath);

  const n = (key) => Number(data?.[key] ?? 0);
  return ok(
    `Everything cleared: ${n('readings')} readings, ${n('customers')} customers, ` +
      `${n('purchases')} deliveries, ${n('expenses')} expenses. ` +
      'Logins, tanks and nozzle starting readings were kept.',
  );
}

// ---------------------------------------------------------------------------
// Fuel purchases
// ---------------------------------------------------------------------------

export async function createPurchase(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const purchaseDate = text(formData, 'purchase_date');
  const quantity = number(formData, 'quantity_litres');
  const rate = number(formData, 'rate');
  const supplierName = text(formData, 'supplier_name');
  const invoiceNumber = text(formData, 'invoice_number');
  const paymentStatus = text(formData, 'payment_status') || 'pending';

  if (!tankId) return fail('Choose which tank the fuel went into.');
  if (!purchaseDate) return fail('Enter the delivery date.');
  if (quantity === null || quantity <= 0) return fail('Enter how many litres were delivered.');
  if (rate === null || rate <= 0) return fail('Enter the rate per litre.');
  if (!supplierName) return fail('Enter the supplier or OMC name.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into fuel_purchases
           (tank_id, purchase_date, quantity_litres, rate, supplier_name, invoice_number, payment_status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tankId, purchaseDate, quantity, rate, supplierName, invoiceNumber || null, paymentStatus, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the purchase.'));
  }

  revalidatePath('/admin/purchases');
  revalidatePath('/admin');
  revalidatePath('/admin/stock-checks');

  return ok(`Saved. ${quantity} L added to stock.`);
}

/**
 * Removes a delivery. Owner only, and the way to correct a mistyped quantity -
 * delete the wrong one and record it again, rather than leaving the tank
 * carrying fuel that never arrived. Tank stock is recalculated by trigger.
 */
export async function deletePurchase(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const purchaseId = text(formData, 'purchase_id');
  if (!purchaseId) return fail('Missing the delivery.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from fuel_purchases where id = $1', [purchaseId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not delete the delivery.'));
  }

  revalidatePath('/admin/purchases');
  revalidatePath('/admin');
  revalidatePath('/admin/stock-checks');
  return ok('Delivery deleted. Tank stock has been recalculated.');
}

export async function setPurchasePaymentStatus(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const purchaseId = text(formData, 'purchase_id');
  const paymentStatus = text(formData, 'payment_status');

  if (!purchaseId) return fail('Missing the purchase.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  try {
    await withUser(profile.id, (client) =>
      client.query('update fuel_purchases set payment_status = $1 where id = $2', [
        paymentStatus,
        purchaseId,
      ]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the purchase.'));
  }

  revalidatePath('/admin/purchases');
  return ok(paymentStatus === 'paid' ? 'Marked as paid.' : 'Marked as pending.');
}

// ---------------------------------------------------------------------------
// Stock checks (the physical dip)
// ---------------------------------------------------------------------------

export async function createStockCheck(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const checkDate = text(formData, 'check_date');
  const actualDip = number(formData, 'actual_dip_reading');
  const note = text(formData, 'note');

  if (!tankId) return fail('Choose a tank.');
  if (!checkDate) return fail('Enter the date of the dip.');
  if (actualDip === null || actualDip < 0) return fail('Enter the measured dip reading.');

  let expected;
  try {
    expected = await withUser(profile.id, async (client) => {
      // Expected stock is worked out by the database, never sent from the
      // browser - otherwise the gain/loss figure could be made to say
      // anything.
      const { rows } = await client.query('select calculate_expected_stock($1, $2) as expected', [
        tankId,
        checkDate,
      ]);
      const expectedStock = rows[0]?.expected ?? 0;

      await client.query(
        `insert into stock_checks (tank_id, check_date, expected_stock, actual_dip_reading, note, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [tankId, checkDate, expectedStock, actualDip, note || null, profile.id],
      );

      return expectedStock;
    });
  } catch (error) {
    return fail(describe(error, 'Could not save the stock check.'));
  }

  const difference = roundMoney(actualDip - Number(expected ?? 0));
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');

  if (difference === 0) return ok('Saved. Stock matches the books exactly.');
  return ok(
    difference > 0
      ? `Saved. Gain of ${difference} L against the books.`
      : `Saved. Loss of ${Math.abs(difference)} L against the books.`,
  );
}

// ---------------------------------------------------------------------------
// Customers and the ledger
// ---------------------------------------------------------------------------

export async function createCustomer(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const vehicleNumber = text(formData, 'vehicle_number');
  const phone = text(formData, 'phone');
  const creditLimit = number(formData, 'credit_limit');

  if (!name) return fail('Enter the customer’s name.');
  if (creditLimit !== null && creditLimit < 0) return fail('The credit limit cannot be negative.');

  let newId;
  try {
    newId = await withUser(profile.id, async (client) => {
      const { rows } = await client.query(
        `insert into customers (name, vehicle_number, phone, credit_limit, created_by)
         values ($1, $2, $3, $4, $5) returning id`,
        [name, vehicleNumber || null, phone || null, creditLimit, profile.id],
      );
      return rows[0].id;
    });
  } catch (error) {
    return fail(describe(error, 'Could not create the customer.'));
  }

  revalidatePath('/admin/customers');
  redirect(`/admin/customers/${newId}`);
}

/**
 * Records a payment from a customer, reducing what they owe.
 *
 * This is an ordinary append to the ledger. Fuel taken on credit gets there by
 * itself, from the reading screen - it is never typed in here.
 */
export async function recordPayment(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const note = text(formData, 'note');

  if (!customerId) return fail('Missing the customer.');
  if (amount === null || amount <= 0) return fail('Enter how much they paid.');
  if (!entryDate) return fail('Enter the date of the payment.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into ledger_entries (customer_id, entry_type, amount, entry_date, note, created_by)
         values ($1, 'credit', $2, $3, $4, $5)`,
        [customerId, amount, entryDate, note || 'Payment received', profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not record the payment.'));
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Payment recorded.');
}

/**
 * A manual correction to the ledger - an opening balance carried over from the
 * old register, or an entry that cancels out an earlier mistake.
 *
 * Nothing is ever edited or deleted: a correction is a new entry pointing the
 * other way, which is what keeps the ledger auditable.
 */
export async function recordLedgerAdjustment(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const entryType = text(formData, 'entry_type');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const note = text(formData, 'note');

  if (!customerId) return fail('Missing the customer.');
  if (!['debit', 'credit'].includes(entryType)) return fail('Choose whether this adds or reduces what they owe.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!entryDate) return fail('Enter a date.');
  if (!note) return fail('Write a note explaining this adjustment - it stays on the record permanently.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into ledger_entries (customer_id, entry_type, amount, entry_date, note, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [customerId, entryType, amount, entryDate, note, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not record the adjustment.'));
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Adjustment recorded.');
}

// ---------------------------------------------------------------------------
// Configuration - super_admin only
// ---------------------------------------------------------------------------

export async function setFuelPrice(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const fuelType = text(formData, 'fuel_type');
  const rate = number(formData, 'rate');
  const effectiveFrom = text(formData, 'effective_from');

  if (!['petrol', 'diesel'].includes(fuelType)) return fail('Choose petrol or diesel.');
  if (rate === null || rate <= 0) return fail('Enter a rate above zero.');
  if (!effectiveFrom) return fail('Enter the date this rate starts from.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into fuel_prices (fuel_type, rate, effective_from, created_by)
         values ($1, $2, $3, $4)`,
        [fuelType, rate, effectiveFrom, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the rate.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  return ok(`${fuelType === 'petrol' ? 'Petrol' : 'Diesel'} rate set to Rs ${rate} per litre.`);
}

export async function updateTank(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const capacity = number(formData, 'capacity_litres');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingStockDate = text(formData, 'opening_stock_date');

  if (!tankId) return fail('Missing the tank.');
  if (capacity === null || capacity <= 0) return fail('Enter the tank capacity.');
  if (openingStock === null || openingStock < 0) return fail('Enter the opening stock.');
  if (!openingStockDate) return fail('Enter the date the opening stock applies from.');

  // A tank cannot hold more than it holds. Worth refusing rather than warning:
  // opening stock is what every later litre is measured against, so a figure
  // above capacity quietly overstates the stock on hand from that day onward,
  // and the dashboard reads as fuel that was never in the ground. The database
  // enforces the same rule with a CHECK constraint - this is the friendly
  // version of that refusal.
  if (openingStock > capacity) {
    return fail(
      `Opening stock cannot be more than the tank holds. ` +
        `This tank holds ${formatLitres(capacity)} and you entered ${formatLitres(openingStock)}. ` +
        `Raise the capacity if the tank really is bigger.`,
    );
  }

  try {
    const changed = await withUser(profile.id, async (client) => {
      const { rows } = await client.query(
        'select capacity_litres, opening_stock_litres, opening_stock_date from tanks where id = $1',
        [tankId],
      );
      const current = rows[0];
      if (!current) throw new Error('Could not read the tank.');

      // DATE columns come back as 'YYYY-MM-DD' strings - see the type parser
      // in db.js - so this compares like with like.
      if (
        Number(current.capacity_litres) === capacity &&
        Number(current.opening_stock_litres) === openingStock &&
        current.opening_stock_date === openingStockDate
      ) {
        return false;
      }

      await client.query(
        `update tanks
            set capacity_litres = $1, opening_stock_litres = $2, opening_stock_date = $3
          where id = $4`,
        [capacity, openingStock, openingStockDate, tankId],
      );
      return true;
    });

    if (!changed) return ok('No change - this tank is already set that way.');
  } catch (error) {
    return fail(describe(error, 'Could not update the tank.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  return ok('Tank updated.');
}

export async function setNozzleTank(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const nozzleId = text(formData, 'nozzle_id');
  const tankId = text(formData, 'tank_id');
  const startingReading = number(formData, 'starting_reading');

  if (!nozzleId || !tankId) return fail('Missing the nozzle or tank.');
  if (startingReading === null) return fail('Enter the meter reading this nozzle starts from.');
  if (startingReading < 0) return fail('A meter reading cannot be negative.');

  try {
    // Compare against what is stored before writing. The button already
    // refuses to submit an unchanged row, but that is a claim made by the
    // browser; this is the one made by the database.
    const changed = await withUser(profile.id, async (client) => {
      const { rows } = await client.query(
        'select tank_id, starting_reading from nozzles where id = $1',
        [nozzleId],
      );
      const current = rows[0];
      if (!current) throw new Error('Could not read the nozzle.');

      if (current.tank_id === tankId && Number(current.starting_reading) === startingReading) {
        return false;
      }

      await client.query('update nozzles set tank_id = $1, starting_reading = $2 where id = $3', [
        tankId,
        startingReading,
        nozzleId,
      ]);
      return true;
    });

    if (!changed) return ok('No change - this nozzle already reads that way.');
  } catch (error) {
    return fail(describe(error, 'Could not update the nozzle.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  return ok('Nozzle updated.');
}

export async function createExpense(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const category = text(formData, 'category');
  const amount = number(formData, 'amount');
  const expenseDate = text(formData, 'expense_date');
  const note = text(formData, 'note');

  if (!category) return fail('Enter a category.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!expenseDate) return fail('Enter the date.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into expenses (category, amount, expense_date, note, created_by)
         values ($1, $2, $3, $4, $5)`,
        [category, amount, expenseDate, note || null, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the expense.'));
  }

  revalidatePath('/admin/reports');
  return ok('Expense recorded.');
}

/**
 * Removes an expense. Owner only - and the way to fix a mistyped amount, since
 * an expense feeds the profit figure and a wrong one quietly distorts it.
 */
export async function deleteExpense(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const expenseId = text(formData, 'expense_id');
  if (!expenseId) return fail('Missing the expense.');

  try {
    await withUser(profile.id, (client) => client.query('delete from expenses where id = $1', [expenseId]));
  } catch (error) {
    return fail(describe(error, 'Could not delete the expense.'));
  }

  revalidatePath('/admin/reports');
  return ok('Expense deleted.');
}

// ---------------------------------------------------------------------------
// Staff accounts - super_admin only
//
// There is no public signup. Every login is created here, through
// create_staff_login() (002_identity_and_sessions.sql) which hashes the
// password with pgcrypto and never lets it exist anywhere else.
// ---------------------------------------------------------------------------

export async function createStaffAccount(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const fullName = text(formData, 'full_name');
  const role = text(formData, 'role');

  if (!email) return fail('Enter an email address.');
  if (password.length < 8) return fail('The password must be at least 8 characters.');
  if (!fullName) return fail('Enter the person’s name.');
  if (![ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY].includes(role)) return fail('Choose a role.');

  try {
    await withUser(profile.id, (client) =>
      client.query('select create_staff_login($1, $2, $3, $4)', [email, fullName, password, role]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not create the account.'));
  }

  revalidatePath('/admin/settings');
  return ok(`${fullName} can now sign in.`);
}

export async function setStaffRole(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const role = text(formData, 'role');

  if (!profileId) return fail('Missing the account.');
  if (![ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY].includes(role)) return fail('Choose a role.');
  if (profileId === actor.profile.id) {
    return fail('You cannot change your own role - ask the other owner account to do it.');
  }

  try {
    await withUser(actor.profile.id, (client) =>
      client.query('update profiles set role = $1 where id = $2', [role, profileId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not change the role.'));
  }

  revalidatePath('/admin/settings');
  return ok('Role updated.');
}

export async function setStaffActive(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!profileId) return fail('Missing the account.');
  if (profileId === actor.profile.id) {
    return fail('You cannot deactivate your own account.');
  }

  try {
    await withUser(actor.profile.id, (client) =>
      client.query('update profiles set is_active = $1 where id = $2', [isActive, profileId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the account.'));
  }

  revalidatePath('/admin/settings');
  return ok(isActive ? 'Account re-enabled.' : 'Account deactivated.');
}

/**
 * Deletes a login for good. Owner only, and the owner's own password is
 * required to go through with it - delete_staff_login()
 * (002_identity_and_sessions.sql) checks it in SQL before doing anything.
 *
 * Why the password. Deactivating is reversible; this is not. The realistic
 * risk is not an attacker, it is the laptop left unlocked in the office - so
 * the one thing an onlooker does not have is asked for.
 *
 * WHAT SURVIVES. The readings, deliveries, expenses and ledger entries this
 * person recorded all stay exactly as they are; only the "recorded by" name
 * against them becomes blank, because the account it pointed at is gone. No
 * money figure moves - see the append-only trigger's exception for this in
 * 003_functions_and_triggers.sql.
 *
 * Deactivating remains the better default and the UI says so - this is for
 * accounts created by mistake, or people who were never really staff.
 */
export async function deleteStaffAccount(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const ownerPassword = String(formData.get('owner_password') ?? '');

  if (!profileId) return fail('Missing the account.');
  if (profileId === actor.profile.id) {
    return fail('You cannot delete your own account.');
  }
  if (!ownerPassword) return fail('Enter your own password to confirm.');

  try {
    await withUser(actor.profile.id, (client) =>
      client.query('select delete_staff_login($1, $2)', [profileId, ownerPassword]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not delete the account.'));
  }

  revalidatePath('/admin/settings');
  return ok('Account deleted. What they recorded has been kept.');
}

// ---------------------------------------------------------------------------
// Banking
//
// The owner's own accounts. Every one of these is super_admin only, and the
// RLS policies say the same thing independently.
// ---------------------------------------------------------------------------

export async function createBankAccount(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const bankName = text(formData, 'bank_name');
  const label = text(formData, 'account_label');
  const accountNumber = text(formData, 'account_number');
  const openingBalance = number(formData, 'opening_balance') ?? 0;

  if (!bankName) return fail('Enter the bank name.');
  if (!label) return fail('Give the account a short name, so you can tell the two apart.');
  if (!Number.isFinite(openingBalance)) return fail('Enter the balance as a number.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into bank_accounts (bank_name, account_label, account_number, opening_balance)
         values ($1, $2, $3, $4)`,
        [bankName, label, accountNumber || null, roundMoney(openingBalance)],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not add the account.'));
  }

  revalidatePath('/admin/banking');
  return ok(`${label} added.`);
}

/**
 * Removes an account and everything recorded against it.
 *
 * Hard delete, on purpose: this is for an account added by mistake or one that
 * has been closed. The transactions go with it, which is why the button asks
 * first and says how many will go.
 */
export async function deleteBankAccount(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const accountId = text(formData, 'account_id');
  if (!accountId) return fail('Missing the account.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from bank_accounts where id = $1', [accountId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not delete the account.'));
  }

  revalidatePath('/admin/banking');
  return ok('Account removed.');
}

/**
 * Records money in or out.
 *
 * Nothing here maintains a balance column - the balance is derived from these
 * rows and the account's carried figures every time it is read, so it cannot
 * drift away from the transactions that produced it. Same principle the tank
 * stock already follows.
 */
export async function createBankTransaction(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const accountId = text(formData, 'account_id');
  const txnType = text(formData, 'txn_type');
  const amount = number(formData, 'amount');
  const txnDate = text(formData, 'txn_date');
  const category = text(formData, 'category');
  const note = text(formData, 'note');

  if (!accountId) return fail('Choose which account.');
  if (txnType !== 'deposit' && txnType !== 'payment') return fail('Choose money in or money out.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!txnDate) return fail('Enter the date.');

  // A payment goes through the RPC, never a plain insert. It may have to come
  // out of more than one account, and several inserts that are really one
  // payment must land together or not at all - which only the database can
  // promise. It also works the split out from the balances as they actually
  // are, so the figures the browser posted are a suggestion, not the decision.
  if (txnType === 'payment') {
    const coverIds = formData
      .getAll('cover_account_ids')
      .filter((id) => typeof id === 'string' && id.length > 0 && id !== accountId);

    let data;
    try {
      const result = await withUser(profile.id, (client) =>
        client.query('select record_bank_payment($1, $2, $3, $4, $5, $6::uuid[]) as result', [
          accountId,
          roundMoney(amount),
          txnDate,
          category || null,
          note || null,
          coverIds,
        ]),
      );
      data = result.rows[0]?.result;
    } catch (error) {
      return fail(describe(error, 'Could not record the payment.'));
    }

    revalidatePath('/admin/banking');
    return ok(data?.message ?? 'Payment recorded.');
  }

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into bank_transactions (account_id, txn_type, amount, txn_date, category, note, created_by)
         values ($1, 'deposit', $2, $3, null, $4, $5)`,
        [accountId, roundMoney(amount), txnDate, note || null, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not record the deposit.'));
  }

  revalidatePath('/admin/banking');
  return ok('Deposit recorded.');
}

export async function deleteBankTransaction(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const txnId = text(formData, 'transaction_id');
  if (!txnId) return fail('Missing the transaction.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from bank_transactions where id = $1', [txnId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not remove the transaction.'));
  }

  revalidatePath('/admin/banking');
  return ok('Transaction removed.');
}

// ---------------------------------------------------------------------------
// First-run setup - creates the one and only owner account, then signs in
// ---------------------------------------------------------------------------

export async function completeFirstRunSetup(_prevState, formData) {
  const email = text(formData, 'email');
  const fullName = text(formData, 'full_name');
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (!email) return fail('Enter an email address.');
  if (!fullName) return fail('Enter your name.');
  if (password.length < 8) return fail('The password must be at least 8 characters.');
  if (password !== confirmPassword) return fail('The two passwords do not match.');

  try {
    await withUser(null, (client) =>
      client.query('select create_first_owner($1, $2, $3)', [email, fullName, password]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not create the owner account.'));
  }

  const profile = await login(email, password);
  if (!profile) {
    return fail('Account created, but signing in failed. Try signing in from the login page.');
  }

  redirect(landingPageFor(profile.role));
}

// ---------------------------------------------------------------------------
// Backup - a consistent copy of the data folder, taken while Postgres keeps
// running.
//
// WHY NOT A PLAIN fs.cp() OF THE LIVE DATA DIRECTORY. Postgres writes to its
// data files continuously; copying them mid-write can catch a table file half
// updated relative to its index, producing a directory that looks complete
// but will not start cleanly. pg_backup_start()/pg_backup_stop() bracket the
// copy so the files on disk are guaranteed consistent as of the moment
// pg_backup_start() returns, the same mechanism `pg_basebackup` uses
// internally - just done here with a plain recursive copy instead of a
// second bundled binary.
//
// A separate superuser connection is used ONLY for this (see
// PG_BACKUP_SUPERUSER / PG_BACKUP_SUPERPASSWORD in electron/bootstrap-db.js):
// app_user is deliberately never granted the privilege pg_backup_start()
// needs, since nothing else in the app should ever be able to call it.
// ---------------------------------------------------------------------------

export async function createBackup(_prevState, _formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const appDataDir = process.env.APP_DATA_DIR;
  const dbDataDir = process.env.DB_DATA_DIR;
  const superuser = process.env.PG_BACKUP_SUPERUSER;
  const superPassword = process.env.PG_BACKUP_SUPERPASSWORD;

  if (!appDataDir || !dbDataDir || !superuser || !superPassword) {
    return fail(
      'Backups only work inside the desktop app, not in a plain browser dev server.',
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(appDataDir, 'backups', stamp);

  const superClient = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: superuser,
    password: superPassword,
  });

  try {
    await superClient.connect();
    await superClient.query('select pg_backup_start($1, true)', [`pump-manager-${stamp}`]);

    try {
      await fs.mkdir(backupDir, { recursive: true });
      await fs.cp(dbDataDir, path.join(backupDir, 'db-data'), { recursive: true });
    } finally {
      // Always stop the backup, even if the copy failed, so the server is
      // not left in "backup in progress" mode.
      await superClient.query('select pg_backup_stop()');
    }
  } catch (error) {
    return fail(describe(error, 'Could not create the backup.'));
  } finally {
    await superClient.end().catch(() => {});
  }

  revalidatePath('/admin/backup');
  return ok(`Backup saved to ${backupDir}. Copy that folder anywhere you keep backups.`);
}
