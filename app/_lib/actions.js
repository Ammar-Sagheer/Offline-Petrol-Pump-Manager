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
  requireRoleIgnoringRestriction,
  ROLES,
  roundMoney,
  roundRupees,
  landingPageFor,
  fullResetAllowed,
  formatLitres,
  formatLitresFine,
  saleAmount as exactSaleAmount,
  formatPKR,
  formatRate,
  shiftISODate,
  formatDate,
  todayISO,
} from './helpers';
import { ASSET_CATEGORIES } from './asset-categories';
import { TREASURY_IN_CATEGORIES, TREASURY_OUT_CATEGORIES } from './treasury-categories';

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
  if (constraint === 'lubricants_active_name_unique') {
    return 'A lubricant with that name is already on the list. Use a different name, or edit the one that is there.';
  }
  if (constraint === 'lubricants_loose_needs_rate') {
    return 'A loose product needs a sale rate - it is the only thing that turns rupees into litres off the drum.';
  }
  if (constraint === 'lubricant_sales_split_matches_amount') {
    return 'Cash plus credit does not equal the amount of the sale. Check the figures and try again.';
  }
  if (constraint === 'lubricant_sales_credit_needs_customer') {
    return 'Choose the customer this was given to on credit.';
  }
  if (constraint === 'nozzles_unit_number_nozzle_label_key') {
    return 'A nozzle with that unit and label already exists. Pick a different combination.';
  }
  // The treasury's two constraint names. Its balance rule (treasury_never_negative)
  // raises its own sentence and needs no entry here - only these two surface as
  // raw Postgres text, because a unique index and a check constraint have no
  // voice of their own.
  if (message.includes('treasury_entries_one_opening')) {
    return 'The safe already has an opening amount recorded, and it can only have one. If this is cash arriving, record it as an Entry instead.';
  }
  if (message.includes('treasury_entries_category_fits_direction')) {
    return 'That reason does not belong to that direction — money in and money out have their own lists. Pick the direction first, then the reason.';
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
    // Ignores restriction on purpose: account hygiene, not new data entry -
    // someone restricted should still be able to secure their own login.
    profile = await requireRoleIgnoringRestriction(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
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

    /*
     * WHOLE RUPEES ON THE SLIP, two decimals on the litres.
     *
     * The slip becomes a debit on the customer's ledger, and a debt is settled
     * with notes - the smallest of which is one rupee. Left at two decimals,
     * 11 litres at Rs 339.48 posted Rs 3,734.28, the customer paid the Rs 3,734
     * he was asked for, and 28 paisa sat on his account for ever because no
     * payment can clear it. See roundRupees in helpers.js, and migration 021
     * for the database half.
     *
     * The sale itself keeps its paisa; the CASH side absorbs the difference,
     * which is where it belongs, cash being the residual and counted in notes.
     */
    cleanedLines.push({
      customer_id: customerId,
      litres: roundMoney(litres),
      amount: roundRupees(amount),
    });
  }

  const litresSoldValue = roundMoney(closing - opening);

  /*
   * EXACT, not `roundMoney(litresSoldValue * rate)`. That was a floating-point
   * multiplication of the same figures Postgres multiplies in `numeric`, and on
   * a half-paisa the two disagreed by a paisa - which the balanced-day
   * constraint refused, on a reading where every figure was correct. See
   * migration 036 (reference 052) and saleAmount() in format-helpers.js.
   *
   * The database no longer believes this number anyway: create_nozzle_reading
   * derives the cash itself. It is still computed here for the guard below and
   * for the message, and it has to be the same figure the database will reach
   * or the sentence would quote a total the books disagree with.
   */
  const saleAmount = exactSaleAmount(litresSoldValue, rate);
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
  const totalCost = number(formData, 'total_cost');
  const supplierName = text(formData, 'supplier_name');
  const invoiceNumber = text(formData, 'invoice_number');
  const paymentStatus = text(formData, 'payment_status') || 'pending';

  if (!tankId) return fail('Choose which tank the fuel went into.');
  if (!purchaseDate) return fail('Enter the delivery date.');
  if (quantity === null || quantity <= 0) return fail('Enter how many litres were delivered.');
  if (totalCost === null || totalCost <= 0) return fail('Enter the amount on the delivery note.');
  if (!supplierName) return fail('Enter the supplier or OMC name.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into fuel_purchases
           (tank_id, purchase_date, quantity_litres, total_cost, supplier_name, invoice_number, payment_status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // The amount on the note is what gets stored; the rate per litre is a
        // generated column derived from it - see migration 011.
        [tankId, purchaseDate, quantity, roundMoney(totalCost), supplierName, invoiceNumber || null, paymentStatus, profile.id],
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
  const taken = text(formData, 'taken') === 'evening' ? 'evening' : 'morning';
  const actualDip = number(formData, 'actual_dip_reading');
  const note = text(formData, 'note');

  if (!tankId) return fail('Choose a tank.');
  if (!checkDate) return fail('Enter the date of the dip.');
  if (actualDip === null || actualDip < 0) return fail('Enter the measured dip reading.');

  /*
   * A dip is a moment, not a day. The pump dips first thing in the morning,
   * before the pumps are switched on, so a dip dated the 11th measures the
   * tank as it stood at the CLOSE OF THE 10TH - and that is the day its
   * gain/loss belongs to. See migration 026; the database generates the same
   * figure into `books_date` and reports on it.
   */
  const closesDate = taken === 'morning' ? shiftISODate(checkDate, -1) : checkDate;

  let expected;
  try {
    expected = await withUser(profile.id, async (client) => {
      // Expected stock is worked out by the database, never sent from the
      // browser - otherwise the gain/loss figure could be made to say
      // anything. The database recomputes it from history on the way in as
      // well, so this value is what the message below reports rather than the
      // last word on what gets stored.
      const { rows } = await client.query('select calculate_expected_stock($1, $2) as expected', [
        tankId,
        closesDate,
      ]);
      const expectedStock = rows[0]?.expected ?? 0;

      await client.query(
        `insert into stock_checks (tank_id, check_date, taken, expected_stock, actual_dip_reading, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [tankId, checkDate, taken, expectedStock, actualDip, note || null, profile.id],
      );

      return expectedStock;
    });
  } catch (error) {
    return fail(describe(error, 'Could not save the stock check.'));
  }

  const difference = roundMoney(actualDip - Number(expected ?? 0));
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');

  const closes = `Checked against ${formatDate(closesDate)}.`;
  if (difference === 0) return ok(`Saved. Stock matches the books exactly. ${closes}`);
  return ok(
    difference > 0
      ? `Saved. Gain of ${difference} L against the books. ${closes}`
      : `Saved. Loss of ${Math.abs(difference)} L against the books. ${closes}`,
  );
}

/**
 * Removes a dip. Owner only, and the way a mistyped rod reading gets corrected:
 * clear it and record it again, the same shape as deleting a purchase or
 * clearing a day on Readings.
 *
 * There is no edit. A dip is two figures and a note, so re-entering it is no
 * slower than editing it - and it keeps one code path for "what a dip is worth"
 * rather than two that could drift apart. Everything downstream is recalculated
 * from history by trigger, so the dips AFTER this one re-base themselves onto
 * whatever is left behind it.
 */
export async function deleteStockCheck(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const checkId = text(formData, 'check_id');
  if (!checkId) return fail('Missing the dip.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from stock_checks where id = $1', [checkId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not clear the dip.'));
  }

  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  return ok('Dip cleared. Record the corrected reading now.');
}

// ---------------------------------------------------------------------------
// Lubricants
//
// Three things live here: the product list, stock coming in from the
// distributor, and sales over the counter.
//
// Who may do what follows the same line as everywhere else. Recording a sale or
// a delivery is daily work, so staff do both. The product list is
// configuration - which brands are stocked, what they are priced at, what was
// on the shelf to begin with - so it belongs to the owner, like the tanks.
// ---------------------------------------------------------------------------

/**
 * Litres, rounded the way Postgres rounds them - three decimals, matching
 * lubricant_sales.litres since migration 017. The third decimal is there for
 * loose oil: Rs 20 out of a drum at Rs 580 a litre is 0.0345 L, and at two
 * decimals that becomes 0.03 - a tenth of the sale lost, every time.
 */
const roundLitres = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export async function createLubricant(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const packSize = number(formData, 'pack_size_litres');
  const saleRate = number(formData, 'sale_rate_per_litre');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingDate = text(formData, 'opening_stock_date');
  const soldLoose = text(formData, 'sold_loose') === 'true';

  if (!name) return fail('Enter the lubricant’s name.');
  if (packSize === null || packSize <= 0) return fail('Enter the pack size in litres.');
  if (saleRate !== null && saleRate <= 0) return fail('The selling rate must be above zero.');
  if (openingStock !== null && openingStock < 0) {
    return fail('The opening stock cannot be negative.');
  }
  if (!openingDate) return fail('Enter the date the opening stock counts from.');
  // The rate is the only thing turning rupees into litres off a drum, so a
  // loose product without one could take money and no stock. The database
  // refuses this too (lubricants_loose_needs_rate); this is the friendlier of
  // the two messages.
  if (soldLoose && (saleRate === null || saleRate <= 0)) {
    return fail(
      'Loose oil needs a selling rate per litre — it is what turns “Rs 20 of oil” ' +
        'into litres off the drum.',
    );
  }

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into lubricants
           (name, pack_size_litres, sale_rate_per_litre,
            opening_stock_litres, opening_stock_date, sold_loose, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [name, packSize, saleRate, openingStock ?? 0, openingDate, soldLoose, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not add the lubricant.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/purchases');
  return ok(`${name} added. It can be sold and restocked from now on.`);
}

export async function updateLubricant(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const name = text(formData, 'name');
  const packSize = number(formData, 'pack_size_litres');
  const saleRate = number(formData, 'sale_rate_per_litre');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingDate = text(formData, 'opening_stock_date');
  const soldLoose = text(formData, 'sold_loose') === 'true';

  if (!lubricantId) return fail('Missing the lubricant.');
  if (!name) return fail('Enter the lubricant’s name.');
  if (packSize === null || packSize <= 0) return fail('Enter the pack size in litres.');
  if (saleRate !== null && saleRate <= 0) return fail('The selling rate must be above zero.');
  if (openingStock === null || openingStock < 0) return fail('Enter the opening stock.');
  if (!openingDate) return fail('Enter the date the opening stock counts from.');
  if (soldLoose && (saleRate === null || saleRate <= 0)) {
    return fail(
      'Loose oil needs a selling rate per litre — it is what turns “Rs 20 of oil” ' +
        'into litres off the drum.',
    );
  }

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `update lubricants
            set name = $2, pack_size_litres = $3, sale_rate_per_litre = $4,
                opening_stock_litres = $5, opening_stock_date = $6, sold_loose = $7
          where id = $1`,
        [lubricantId, name, packSize, saleRate, openingStock, openingDate, soldLoose],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the lubricant.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  return ok(`${name} updated.`);
}

/**
 * Removes a lubricant from the shelf.
 *
 * The database decides which of the two possible meanings applies: a product
 * that was never bought or sold is deleted outright, while one with history is
 * retired so the months it appears in keep adding up. The message says which
 * happened rather than leaving the owner to work it out - see delete_lubricant
 * in migration 013.
 */
export async function deleteLubricant(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  if (!lubricantId) return fail('Missing the lubricant.');

  let result;
  try {
    result = await withUser(profile.id, async (client) => {
      const { rows } = await client.query('select delete_lubricant($1) as result', [lubricantId]);
      return rows[0]?.result ?? null;
    });
  } catch (error) {
    return fail(describe(error, 'Could not remove the lubricant.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/purchases');
  revalidatePath('/admin');

  const name = result?.name ?? 'The lubricant';

  if (result?.removed) return ok(`${name} removed. It was never bought or sold.`);

  return ok(
    `${name} retired. It will not appear on the sale form again, and its past ` +
      'sales and purchases stay on the books.',
  );
}

/** Puts a retired product back on the shelf. */
export async function setLubricantActive(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!lubricantId) return fail('Missing the lubricant.');

  try {
    await withUser(profile.id, (client) =>
      client.query('update lubricants set is_active = $2 where id = $1', [lubricantId, isActive]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the lubricant.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  return ok(isActive ? 'Back on the shelf.' : 'Retired.');
}

/**
 * Stock in from the distributor. Same shape as a fuel delivery, and the same
 * rule about which figure is the fact: the invoice total is typed and the rate
 * per litre is derived from it.
 */
export async function createLubricantPurchase(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const purchaseDate = text(formData, 'purchase_date');
  const quantity = number(formData, 'quantity_litres');
  const totalCost = number(formData, 'total_cost');
  const supplierName = text(formData, 'supplier_name');
  const invoiceNumber = text(formData, 'invoice_number');
  const paymentStatus = text(formData, 'payment_status') || 'pending';

  if (!lubricantId) return fail('Choose which lubricant was delivered.');
  if (!purchaseDate) return fail('Enter the delivery date.');
  if (quantity === null || quantity <= 0) return fail('Enter how many litres were delivered.');
  if (totalCost === null || totalCost <= 0) return fail('Enter the amount on the invoice.');
  if (!supplierName) return fail('Enter the supplier name.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into lubricant_purchases
           (lubricant_id, purchase_date, quantity_litres, total_cost,
            supplier_name, invoice_number, payment_status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          lubricantId,
          purchaseDate,
          roundLitres(quantity),
          roundMoney(totalCost),
          supplierName,
          invoiceNumber || null,
          paymentStatus,
          profile.id,
        ],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the purchase.'));
  }

  revalidatePath('/admin/purchases');
  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');

  return ok(`Saved. ${formatLitres(quantity)} added to the shelf.`);
}

/**
 * One sale over the counter.
 *
 * Cash is derived here - amount minus whatever was put on credit - rather than
 * taken from the form, for the same reason it is on the reading screen: cash
 * should never be able to be quietly wrong. A sale with any credit on it must
 * name the customer, and the database refuses it otherwise.
 */
export async function createLubricantSale(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const saleDate = text(formData, 'sale_date');
  const amount = number(formData, 'amount');
  const creditAmount = number(formData, 'credit_amount') ?? 0;
  const customerId = text(formData, 'customer_id');
  const note = text(formData, 'note');

  if (!lubricantId) return fail('Choose which lubricant was sold.');
  if (!saleDate) return fail('Missing the date.');
  if (amount === null || amount <= 0) return fail('Enter what the customer was charged.');
  if (creditAmount < 0) return fail('The credit amount cannot be negative.');

  /*
   * Whole rupees, and rounded HERE rather than further down, because the loose
   * litres are worked out from this figure - deriving them from an unrounded
   * amount and then storing the rounded one would put the two slightly out of
   * step. A counter sale is money handed over the counter and the smallest
   * thing anyone can hand over is a rupee, so "Rs 462.50 of oil" is not a real
   * sale and a credit of Rs 462.50 is a debt nobody can pay off. Rounding both
   * sides keeps paisa off the customer ledger through this door as well as
   * through the readings one.
   */
  const total = roundRupees(amount);
  if (total <= 0) return fail('A sale has to be at least one rupee.');

  let product;
  try {
    product = await withUser(profile.id, async (client) => {
      const { rows } = await client.query(
        'select name, sold_loose, sale_rate_per_litre from lubricants where id = $1',
        [lubricantId],
      );
      return rows[0] ?? null;
    });
  } catch (error) {
    return fail(describe(error, 'Could not find that lubricant.'));
  }

  if (!product) return fail('Could not find that lubricant.');

  /*
   * Which number was typed depends on the product.
   *
   * A packed product is sold by the litre - the form asks for litres and the
   * amount is whatever was charged for them. A drum is sold by the rupee, so
   * the litres are ARITHMETIC ON THE RATE and are worked out here rather than
   * accepted from the browser. Deriving them server-side is what stops a
   * hand-edited form recording Rs 500 of oil against a teaspoon of stock, and
   * it means the drum's book level can only ever disagree with the drum
   * because the rate is wrong - which is one explanation to check, not two.
   */
  let litres;

  if (product.sold_loose) {
    const rate = Number(product.sale_rate_per_litre);
    if (!Number.isFinite(rate) || rate <= 0) {
      return fail(
        `${product.name} has no selling rate, so there is no way to tell how much oil ` +
          `Rs ${total} is. Set a rate per litre under “Manage lubricants” first.`,
      );
    }
    litres = roundLitres(total / rate);
    if (litres <= 0) {
      return fail(
        `That is too small to record — at ${formatRate(rate)} a litre it works out at ` +
          'under a millilitre.',
      );
    }
  } else {
    litres = number(formData, 'litres');
    if (litres === null || litres <= 0) return fail('Enter how many litres were sold.');
    litres = roundLitres(litres);
  }

  const credit = roundRupees(creditAmount);

  if (credit > total) {
    return fail('The amount on credit is more than the sale itself. Check the figures.');
  }
  if (credit > 0 && !customerId) {
    return fail('Choose the customer this was given to on credit.');
  }

  const cash = roundMoney(total - credit);

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into lubricant_sales
           (lubricant_id, sale_date, litres, amount, cash_amount, credit_amount,
            customer_id, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          lubricantId,
          saleDate,
          litres,
          total,
          cash,
          credit,
          // A cash sale may still name the customer, but only a credit sale needs to.
          customerId || null,
          note || null,
          profile.id,
        ],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the sale.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/lubricants/loose');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  if (credit > 0) revalidatePath('/admin/customers');

  /*
   * The confirmation leads with whichever number the owner actually typed. On
   * a drum that is the money - reading back "0.034 L sold" to someone who
   * typed "20" is an answer to a question nobody asked, and it looks wrong
   * besides.
   */
  const sold = product.sold_loose
    ? `${formatPKR(total)} of ${product.name} (${formatLitresFine(litres)})`
    : formatLitres(litres);

  return ok(
    credit > 0
      ? `Saved. ${sold} sold, ${formatPKR(credit)} of it on credit and posted to the ledger.`
      : `Saved. ${sold} sold for cash.`,
  );
}

/**
 * Removes a sale. Owner only, like deleting a nozzle reading, and for the same
 * reason: the credit on it has already moved a customer's balance. The database
 * posts the offsetting entry before the row goes, so the ledger keeps showing
 * both what happened and what undid it.
 */
export async function deleteLubricantSale(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const saleId = text(formData, 'sale_id');
  if (!saleId) return fail('Missing the sale.');

  let result;
  try {
    result = await withUser(profile.id, async (client) => {
      const { rows } = await client.query('select delete_lubricant_sale($1) as result', [saleId]);
      return rows[0]?.result ?? null;
    });
  } catch (error) {
    return fail(describe(error, 'Could not delete the sale.'));
  }

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  return ok(
    result?.credit_reversed
      ? 'Sale deleted, and the credit on it reversed on the customer’s ledger.'
      : 'Sale deleted. Stock has been recalculated.',
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

  /*
   * Most names typed into this app are not new customers - they came out of a
   * paper register, and some already owe money while a few have paid ahead.
   * The opening balance is asked for HERE rather than left as a second trip to
   * the customer's own page, because the second trip is the one that gets
   * forgotten - and an account silently starting at zero when the man owes
   * Rs 40,000 is money leaving the books quietly.
   *
   * The amount is always positive and the direction says which way it goes. A
   * signed figure would allow "-500" and "they owe us" to disagree, with
   * nothing to settle the argument.
   */
  const openingDirection = text(formData, 'opening_direction');
  const openingAmount = number(formData, 'opening_amount');

  if (!name) return fail('Enter the customer’s name.');
  if (creditLimit !== null && creditLimit < 0) return fail('The credit limit cannot be negative.');
  if (openingAmount !== null && openingAmount < 0) {
    return fail('Enter the opening balance as a positive figure and pick which way it goes.');
  }

  const opening = openingDirection ? roundRupees(openingAmount ?? 0) : 0;
  if (opening > 0 && !['owes', 'in_credit'].includes(openingDirection)) {
    return fail('Say whether the customer owes this amount or has paid ahead.');
  }

  // One transaction for the customer and their opening entry - see migration
  // 023. Two separate inserts could leave the customer created and the balance
  // missing, which is the silent zero this is meant to prevent.
  try {
    await withUser(profile.id, (client) =>
      client.query(
        'select create_customer_with_opening($1, $2, $3, $4, $5, $6) as id',
        [
          name,
          vehicleNumber || null,
          phone || null,
          creditLimit,
          opening,
          opening > 0 ? openingDirection : null,
        ],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not create the customer.'));
  }

  revalidatePath('/admin/customers');

  /*
   * Returns rather than redirects. This form lives in a dialog on the customer
   * list now, so the useful ending is the dialog closing over a list that
   * already has the new name on it - not being thrown onto a detail page that
   * shows nothing except what was typed a second ago.
   *
   * The opening balance is repeated back because it is the one figure here
   * that came from a choice rather than a text box, and this is the last
   * chance to notice it went the wrong way before it is on the ledger for good.
   */
  if (opening > 0) {
    return ok(
      openingDirection === 'owes'
        ? `${name} added, owing ${formatPKR(opening)}.`
        : `${name} added, with ${formatPKR(opening)} paid ahead.`,
    );
  }

  return ok(`${name} added.`);
}

/**
 * Correcting a customer's details - a misspelled name, a new phone number, a
 * different vehicle, a raised credit limit.
 *
 * DETAILS ONLY. Nothing here can touch the balance: that lives in the ledger,
 * which is append-only, and is moved with a payment or an adjustment. Keeping
 * the two apart is what makes this safe to hand to staff - the worst outcome
 * of a mistake here is a wrong spelling, not a wrong figure.
 *
 * Same roles as creating one. Someone who can add a customer with a typo
 * should be able to fix the typo.
 */
export async function updateCustomer(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const name = text(formData, 'name');
  const vehicleNumber = text(formData, 'vehicle_number');
  const phone = text(formData, 'phone');
  const creditLimit = number(formData, 'credit_limit');

  if (!customerId) return fail('Missing the customer.');
  if (!name) return fail('Enter the customer’s name.');
  if (creditLimit !== null && creditLimit < 0) return fail('The credit limit cannot be negative.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `update customers
            set name = $2, vehicle_number = $3, phone = $4, credit_limit = $5
          where id = $1`,
        [customerId, name, vehicleNumber || null, phone || null, creditLimit],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the customer.'));
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Details updated.');
}

/**
 * Takes a customer off the list - a name typed wrong, a duplicate, or an
 * account that has genuinely finished.
 *
 * Owner only, and the database decides which of the two possible meanings
 * applies: an account that never traded is deleted outright, one with history
 * is retired so the months it appears in keep adding up. It refuses either way
 * while the balance is not zero, because a retired customer drops out of
 * "total outstanding" and a debt must not vanish quietly. The message says
 * which happened, and names the figure when it refuses - see delete_customer
 * in migration 020.
 */
export async function deleteCustomer(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  if (!customerId) return fail('Missing the customer.');

  let result;
  try {
    result = await withUser(profile.id, async (client) => {
      const { rows } = await client.query('select delete_customer($1) as result', [customerId]);
      return rows[0]?.result ?? null;
    });
  } catch (error) {
    return fail(describe(error, 'Could not remove the customer.'));
  }

  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  const name = result?.name ?? 'The customer';

  if (result?.removed) {
    return ok(`${name} removed. They had never taken anything on credit.`);
  }

  return ok(
    `${name} removed from the list. Their past credit and payments stay on the ` +
      'books, and they can be brought back at any time.',
  );
}

/**
 * Deletes a customer for good - the row and their ledger entries with it.
 *
 * The step beyond Remove, for a name added by mistake that picked up entries
 * and would otherwise sit in the Removed list for ever looking like a real
 * customer who left.
 *
 * The database decides whether it is allowed, and the line is narrow on
 * purpose: only an account whose whole footprint is entries the owner typed
 * himself. A credit slip belongs to a nozzle reading and a day already
 * reported, so a customer who genuinely traded can only ever be retired - the
 * refusal says so and points at clearing the day instead. See purge_customer
 * in migration 022.
 *
 * The typed name is checked in the database rather than only in the browser,
 * because it is the last thing standing between a mis-aimed click and money
 * records that do not come back.
 */
export async function purgeCustomer(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const confirmName = text(formData, 'confirm_name');

  if (!customerId) return fail('Missing the customer.');
  if (!confirmName) return fail('Type the customer’s name to confirm.');

  let result;
  try {
    result = await withUser(profile.id, async (client) => {
      const { rows } = await client.query('select purge_customer($1, $2) as result', [
        customerId,
        confirmName,
      ]);
      return rows[0]?.result ?? null;
    });
  } catch (error) {
    return fail(describe(error, 'Could not delete the customer.'));
  }

  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  const name = result?.name ?? 'The customer';
  const gone = Number(result?.entries_deleted ?? 0);

  return ok(
    gone > 0
      ? `${name} deleted for good, along with ${gone} ledger ${gone === 1 ? 'entry' : 'entries'}.`
      : `${name} deleted for good.`,
  );
}

/** Puts a removed customer back on the list. */
export async function setCustomerActive(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!customerId) return fail('Missing the customer.');

  try {
    await withUser(profile.id, (client) =>
      client.query('update customers set is_active = $2 where id = $1', [customerId, isActive]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the customer.'));
  }

  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  return ok(isActive ? 'Back on the customer list.' : 'Removed from the list.');
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

  // Whole rupees: this is cash over the counter, and there is nothing smaller
  // to hand over.
  const paid = roundRupees(amount);
  if (paid <= 0) return fail('A payment has to be at least one rupee.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into ledger_entries (customer_id, entry_type, amount, entry_date, note, created_by)
         values ($1, 'credit', $2, $3, $4, $5)`,
        [customerId, paid, entryDate, note || 'Payment received', profile.id],
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

  // Whole rupees, like every other entry on the ledger. An adjustment is the
  // tool for squaring an account, and one that could itself leave paisa behind
  // would not finish the job.
  const adjustment = roundRupees(amount);
  if (adjustment <= 0) return fail('An adjustment has to be at least one rupee.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into ledger_entries (customer_id, entry_type, amount, entry_date, note, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [customerId, entryType, adjustment, entryDate, note, profile.id],
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
  return ok(`${fuelType === 'petrol' ? 'Petrol' : 'Diesel'} rate set to ${formatRate(rate)} per litre.`);
}

/**
 * Removes a rate. Owner only, and the only way to correct a mistyped one.
 *
 * A fuel and a date can carry one rate, enforced by a unique constraint - so
 * typing 339.48 when you meant 393.48 cannot be fixed by saving again over the
 * top. Without this the wrong price stands for the whole day and every reading
 * entered against it is wrong.
 *
 * WHAT IT DOES NOT UNDO. Readings already saved keep the rate they were sold
 * at - a copy sits on the reading row itself, which is what stops a later price
 * change quietly rewriting last week's takings. So removing a rate fixes what
 * is entered from here on and leaves what is already entered alone; those days
 * have to be cleared and re-entered. The button says so before it acts.
 */
export async function deleteFuelPrice(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const priceId = text(formData, 'price_id');
  if (!priceId) return fail('Missing the rate.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from fuel_prices where id = $1', [priceId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not remove the rate.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  return ok('Rate removed. Set the correct one now.');
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

/**
 * All six nozzles at once - how the pump is plumbed, saved as one thing.
 *
 * Describing the wiring is a single job done once when the pump goes onto the
 * system, so it gets one button rather than six. The rows arrive as three
 * parallel lists because a form serialises repeated field names in the order
 * they appear in the markup, which is what lines index 2 of one list up with
 * index 2 of the next.
 *
 * Everything is validated before anything is sent: a half-valid submission
 * should be refused whole, not applied as far as the first bad row. The write
 * itself is one UPDATE inside set_nozzle_wiring() for the same reason - see
 * migration 012.
 */
export async function setNozzleWiring(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const ids = formData.getAll('nozzle_id').map((value) => String(value));
  const tankIds = formData.getAll('tank_id').map((value) => String(value));
  const readings = formData.getAll('starting_reading').map((value) => String(value));

  if (ids.length === 0) return fail('Nothing to save.');
  if (ids.length !== tankIds.length || ids.length !== readings.length) {
    return fail('That form arrived incomplete. Reopen it and try again.');
  }

  const rows = [];
  for (let index = 0; index < ids.length; index += 1) {
    const startingReading = Number(readings[index]);

    if (!ids[index] || !tankIds[index]) {
      return fail('Every nozzle needs a tank. Check the list and try again.');
    }
    if (readings[index].trim() === '' || !Number.isFinite(startingReading)) {
      return fail('Every nozzle needs a starting meter reading, even if it is 0.');
    }
    if (startingReading < 0) {
      return fail('A meter reading cannot be negative.');
    }

    rows.push({
      nozzle_id: ids[index],
      tank_id: tankIds[index],
      starting_reading: roundMoney(startingReading),
    });
  }

  let saved;
  try {
    saved = await withUser(profile.id, async (client) => {
      const { rows: result } = await client.query('select set_nozzle_wiring($1::jsonb) as count', [
        JSON.stringify(rows),
      ]);
      return result[0].count;
    });
  } catch (error) {
    return fail(describe(error, 'Could not save the nozzle wiring.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');

  const count = Number(saved ?? rows.length);
  return ok(`Saved. ${count} ${count === 1 ? 'nozzle' : 'nozzles'} updated.`);
}

/**
 * A new nozzle - a real pump's unit/nozzle layout varies, and the seeded 2
 * diesel + 4 petrol set (005) is only ever a starting point. Plain insert,
 * same reasoning as createBankAccount: one new row is not a job that needs an
 * RPC of its own, and RLS ("nozzles: super admin writes", 004) already
 * restricts the write to the owner.
 */
export async function addNozzle(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const unitNumber = number(formData, 'unit_number');
  const nozzleLabel = text(formData, 'nozzle_label');
  const startingReading = number(formData, 'starting_reading') ?? 0;

  if (!tankId) return fail('Choose which tank this nozzle draws from.');
  if (!Number.isInteger(unitNumber) || unitNumber <= 0) {
    return fail('Enter the unit number as a whole number, greater than 0.');
  }
  if (!nozzleLabel) return fail('Give the nozzle a label, e.g. A or B.');
  if (!Number.isFinite(startingReading) || startingReading < 0) {
    return fail('Enter the starting meter reading, 0 or more.');
  }

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into nozzles (tank_id, unit_number, nozzle_label, starting_reading)
         values ($1, $2, $3, $4)`,
        [tankId, unitNumber, nozzleLabel, roundMoney(startingReading)],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not add the nozzle.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  return ok(`Unit ${unitNumber} nozzle ${nozzleLabel} added.`);
}

/**
 * Removing a nozzle added by mistake - or retiring one that has been used, if
 * it turns out to have history. Which one happens is decided in
 * delete_nozzle() (031), not here: a nozzle with any reading against it
 * cannot be deleted outright (nozzle_readings.nozzle_id is ON DELETE
 * RESTRICT, 001), the same money-history rule as delete_customer.
 *
 * Requires the acting owner's own password, re-checked in SQL - the same
 * treatment deleteStaffAccount gives a login, for the same reason: this is
 * not a toggle a screen left open should be able to trigger by itself.
 */
export async function deleteNozzle(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const nozzleId = text(formData, 'nozzle_id');
  const ownerPassword = String(formData.get('owner_password') ?? '');

  if (!nozzleId) return fail('Missing the nozzle.');
  if (!ownerPassword) return fail('Enter your own password to confirm.');

  let result;
  try {
    result = await withUser(actor.profile.id, async (client) => {
      const { rows } = await client.query('select delete_nozzle($1, $2) as result', [
        nozzleId,
        ownerPassword,
      ]);
      return rows[0].result;
    });
  } catch (error) {
    return fail(describe(error, 'Could not remove the nozzle.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');

  const label = `Unit ${result.unit_number} nozzle ${result.nozzle_label}`;
  return result.removed
    ? ok(`${label} deleted - it had never recorded a reading.`)
    : ok(
        `${label} retired - it has ${result.readings} reading${result.readings === 1 ? '' : 's'} on file, so those stay on the books. It is off the reading sheet from now on.`,
      );
}

/** Puts a retired nozzle back into service. See RestoreCustomerButton for the identical shape. */
export async function setNozzleActive(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const nozzleId = text(formData, 'nozzle_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!nozzleId) return fail('Missing the nozzle.');

  try {
    await withUser(profile.id, (client) =>
      client.query('update nozzles set is_active = $2 where id = $1', [nozzleId, isActive]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not update the nozzle.'));
  }

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  return ok(isActive ? 'Back on the reading sheet.' : 'Retired.');
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
// Company assets - super_admin only
//
// What the pump has bought and kept, not spending or takings. See migration
// 025 - the same treatment as banking, in both the database and here.
// ---------------------------------------------------------------------------

// Derived from the shared list rather than typed out again here, so a
// category added to asset-categories.js is valid the moment it exists instead
// of being silently refused by a second, forgotten copy of the same five
// words.
const ASSET_CATEGORY_VALUES = ASSET_CATEGORIES.map((category) => category.value);

export async function createCompanyAsset(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const category = text(formData, 'category') || 'other';
  const purchaseValue = number(formData, 'purchase_value');
  const purchaseDate = text(formData, 'purchase_date');
  const note = text(formData, 'note');

  if (!name) return fail('Enter what was bought.');
  if (!ASSET_CATEGORY_VALUES.includes(category)) return fail('Choose a category.');
  if (purchaseValue === null || purchaseValue <= 0) return fail('Enter what it cost, above zero.');
  if (!purchaseDate) return fail('Enter the date it was bought.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into company_assets (name, category, purchase_value, purchase_date, note, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [name, category, purchaseValue, purchaseDate, note || null, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not record the asset.'));
  }

  revalidatePath('/admin/company-assets');
  return ok(`${name} added.`);
}

export async function updateCompanyAsset(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const assetId = text(formData, 'asset_id');
  const name = text(formData, 'name');
  const category = text(formData, 'category') || 'other';
  const purchaseValue = number(formData, 'purchase_value');
  const purchaseDate = text(formData, 'purchase_date');
  const note = text(formData, 'note');

  if (!assetId) return fail('Missing the asset.');
  if (!name) return fail('Enter what was bought.');
  if (!ASSET_CATEGORY_VALUES.includes(category)) return fail('Choose a category.');
  if (purchaseValue === null || purchaseValue <= 0) return fail('Enter what it cost, above zero.');
  if (!purchaseDate) return fail('Enter the date it was bought.');

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `update company_assets
            set name = $2, category = $3, purchase_value = $4, purchase_date = $5, note = $6
          where id = $1`,
        [assetId, name, category, purchaseValue, purchaseDate, note || null],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not save the changes.'));
  }

  revalidatePath('/admin/company-assets');
  return ok('Changes saved.');
}

export async function deleteCompanyAsset(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const assetId = text(formData, 'asset_id');
  if (!assetId) return fail('Missing the asset.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from company_assets where id = $1', [assetId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not remove the asset.'));
  }

  revalidatePath('/admin/company-assets');
  return ok('Asset removed.');
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
    // Ignores restriction on purpose: getting your own data safely off this
    // machine is exactly what "existing data stays exportable" promises -
    // it would be a strange kind of restriction that blocked the one thing
    // most likely to help someone actually resolve it.
    await requireRoleIgnoringRestriction(ROLES.SUPER_ADMIN);
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
      await fs.cp(dbDataDir, path.join(backupDir, 'db-data'), {
        recursive: true,
        // postmaster.pid and postmaster.opts describe the RUNNING server, and
        // a copy taken while it runs necessarily captures them. Postgres then
        // refuses to start from the restored folder - "lock file
        // postmaster.pid already exists ... is another postmaster running" -
        // because it cannot tell a stale pid from a live one. They are
        // regenerated on every start, so leaving them out costs nothing.
        filter: (source) => {
          const name = path.basename(source);
          return name !== 'postmaster.pid' && name !== 'postmaster.opts';
        },
      });

      // config.json goes in the backup too, and this is not optional.
      //
      // It holds the randomly generated passwords for this install, and those
      // same passwords are stored INSIDE the cluster's own catalogue. A fresh
      // install generates new random ones, so restoring db-data next to a
      // freshly generated config.json gives a database the app cannot
      // authenticate against at all ("password authentication failed for user
      // postgres") - the data is intact and unreachable. Restoring the pair
      // together is what makes a backup folder self-sufficient.
      //
      // That does mean the backup contains credentials, so it is written with
      // the same 0600 mode as the original. They only guard a database bound
      // to 127.0.0.1 on this machine, but there is no reason to widen them.
      await fs.copyFile(
        path.join(appDataDir, 'config.json'),
        path.join(backupDir, 'config.json'),
      );
      await fs.chmod(path.join(backupDir, 'config.json'), 0o600);
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
  return ok(
    `Backup saved to ${backupDir}. Copy that whole folder somewhere safe - it has ` +
      'everything needed to restore onto another machine.',
  );
}

// ---------------------------------------------------------------------------
// Restore - see docs/RESTORE_FROM_BACKUP.md for the full design.
//
// The restore itself cannot happen here. It means stopping and replacing the
// very database this Server Action just authenticated against - a Server
// Action runs inside the Next.js child process, and doing that to itself
// would mean trying to return a response to a page whose server no longer
// exists. That part runs in Electron's main process (electron/main.js,
// performRestore()) instead, reached over the one-function IPC bridge in
// electron/preload.js.
//
// What belongs here is the part that DOES need the database: checking the
// owner is who they say they are, before the thing that could answer that
// question goes away. Confirm first, hand off second - never the other way
// around.
// ---------------------------------------------------------------------------

export async function confirmRestore(_prevState, formData) {
  let profile;
  try {
    // Ignores restriction on purpose: restoring an older backup does not
    // create new data, and refusing recovery specifically because
    // something needs recovering would be backwards.
    profile = await requireRoleIgnoringRestriction(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const password = String(formData.get('owner_password') ?? '');
  const confirmation = text(formData, 'confirmation');

  if (confirmation !== 'RESTORE') return fail('Type RESTORE in capitals to confirm.');
  if (!password) return fail('Enter your own password to confirm.');

  const passwordOk = await withUser(null, async (client) => {
    const { rows } = await client.query('select * from verify_login($1, $2)', [
      profile.email,
      password,
    ]);
    return Boolean(rows[0]);
  });

  if (!passwordOk) return fail('That is not your password. Nothing has been restored.');

  return ok('Confirmed.');
}

/**
 * The previous restore's pre-restore data, moved aside rather than deleted
 * (performRestore()'s replacedDir() in electron/main.js) - "replaced on
 * <date>" on the Backup page, with its own Undo (restore from it, handled
 * the same as any other restore) and Delete action.
 *
 * One fixed folder, not a name derived from anything the client sends - it
 * is always exactly `${APP_DATA_DIR}/replaced`, which is what keeps this
 * from being pointed anywhere else.
 */
export async function deleteReplacedSnapshot(_prevState, _formData) {
  try {
    // Ignores restriction on purpose - same reasoning as confirmRestore()
    // just above: housekeeping around recovery, not new data entry.
    await requireRoleIgnoringRestriction(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const appDataDir = process.env.APP_DATA_DIR;
  if (!appDataDir) return fail('Only available inside the desktop app.');

  try {
    await fs.rm(path.join(appDataDir, 'replaced'), { recursive: true, force: true });
  } catch (error) {
    return fail(describe(error, 'Could not delete that snapshot.'));
  }

  revalidatePath('/admin/backup');
  return ok('Deleted.');
}

// ---------------------------------------------------------------------------
// Treasury - super_admin only
//
// Cash into and out of the safe on site. Standalone: nothing here touches
// banking, expenses or the customer ledger, even where an entry describes
// money that also appears in one of them. See migration 032.
// ---------------------------------------------------------------------------

// Derived from the shared lists rather than typed out again, for the reason
// ASSET_CATEGORIES's own values list exists: a second, forgotten copy of the
// same words is how a category added in one place gets silently refused in
// another.
const TREASURY_CATEGORY_VALUES = {
  in: TREASURY_IN_CATEGORIES.map((category) => category.value),
  out: TREASURY_OUT_CATEGORIES.map((category) => category.value),
};

export async function createTreasuryEntry(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const direction = text(formData, 'direction');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const category = text(formData, 'category');
  const details = text(formData, 'details');

  if (direction !== 'in' && direction !== 'out') {
    return fail('Say whether cash came in or went out.');
  }
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!entryDate) return fail('Enter the date.');
  if (!TREASURY_CATEGORY_VALUES[direction].includes(category)) {
    return fail('Choose what this was for.');
  }

  /*
   * A courtesy check, not a rule - the database allows a future date and
   * should, because nothing about a future date is dishonest. What it catches
   * is the typo that matters: 2027 for 2026 parks an entry at the bottom of
   * the sheet for a year, where the running balance still adds up and nobody
   * looks. One day of slack, because the pump's day and the tablet's clock can
   * disagree by a few hours.
   */
  if (entryDate > shiftISODate(todayISO(), 1)) {
    return fail(`That date is in the future. Today is ${formatDate(todayISO())}.`);
  }

  try {
    await withUser(profile.id, (client) =>
      client.query(
        `insert into treasury_entries (entry_date, direction, amount, category, details, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [entryDate, direction, roundMoney(amount), category, details || null, profile.id],
      ),
    );
  } catch (error) {
    return fail(describe(error, 'Could not record the entry.'));
  }

  revalidatePath('/admin/treasury');
  return ok(
    direction === 'in'
      ? `${formatPKR(amount)} recorded into the safe.`
      : `${formatPKR(amount)} recorded out of the safe.`,
  );
}

/**
 * Removes one entry.
 *
 * Nothing special happens here, and that is worth saying: the running balance
 * is not stored anywhere, so removing a row simply takes it out of the chain
 * and every balance after it moves. If that would drop the safe below zero at
 * any point, the database refuses the delete and says which line it broke on
 * (treasury_never_negative, migration 032).
 */
export async function deleteTreasuryEntry(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const entryId = text(formData, 'entry_id');
  if (!entryId) return fail('Missing the entry.');

  try {
    await withUser(profile.id, (client) =>
      client.query('delete from treasury_entries where id = $1', [entryId]),
    );
  } catch (error) {
    return fail(describe(error, 'Could not remove the entry.'));
  }

  revalidatePath('/admin/treasury');
  return ok('Entry removed.');
}

// ---------------------------------------------------------------------------
// Trimming the activity log - super_admin only
//
// The log gains a line per change - dozens on a working day - and the part of
// it anyone ever reads is the recent end. Left alone it becomes hundreds of
// pages with the useful end buried at the top.
//
// The period is all that crosses the wire: how many months to KEEP, one of
// four. The cutoff date is worked out in the database from pump_today(), so
// the browser cannot name an instant of its own, and the count the dialog
// showed and the rows that actually go are computed the same way in the same
// place - see migration 037.
//
// Append-only is not weakened by this. A line still cannot be edited, and a
// single line cannot be picked out and removed: it is a whole period or
// nothing, the last month is never on offer, and the trim writes its own line
// into the log saying who did it and how many went.
// ---------------------------------------------------------------------------
export async function clearOldActivity(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const keepMonths = number(formData, 'keep_months');
  if (![1, 3, 6, 12].includes(keepMonths)) {
    return fail('Choose how much of the log to keep.');
  }

  let data;
  try {
    data = await withUser(profile.id, async (client) => {
      const { rows } = await client.query('select clear_activity_log($1) as result', [keepMonths]);
      return rows[0]?.result;
    });
  } catch (error) {
    return fail(describe(error, 'Could not clear the old entries.'));
  }

  revalidatePath('/admin/activity');

  const gone = Number(data?.deleted ?? 0);
  const cutoff = data?.cutoff ? formatDate(data.cutoff) : null;

  if (gone === 0) {
    return ok(`Nothing to clear — every entry is newer than ${cutoff ?? 'the cutoff'}.`);
  }

  return ok(
    `${gone} ${gone === 1 ? 'entry' : 'entries'} cleared` +
      (cutoff ? ` — everything before ${cutoff} is gone.` : '.'),
  );
}
