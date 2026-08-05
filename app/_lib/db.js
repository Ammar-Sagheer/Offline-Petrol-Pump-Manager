/**
 * Postgres connection for SERVER Components, Server Actions and route handlers.
 *
 * Replaces supabase.js/supabase-server.js. There is no PostgREST here, so the
 * app talks to Postgres directly through `pg`, as the single `app_user` login
 * role every migration's RLS policies are written against (see
 * db/migrations/004_rls_policies.sql).
 *
 * RLS still decides what a query can see or write. What changed is how it
 * learns who is asking: instead of a JWT claim GoTrue verified, each request
 * sets a Postgres session variable itself, right after checking the session
 * cookie - see auth.js for that half.
 */
import 'server-only';
import { Pool, types } from 'pg';

/*
 * Hand back DATE columns as the plain 'YYYY-MM-DD' string Postgres stores,
 * not as a JavaScript Date.
 *
 * Supabase returned these over JSON, so they arrived as strings, and every
 * component and helper in the reference app was written against that -
 * formatDate() slices the first 10 characters and splits on '-'. The `pg`
 * driver instead parses a DATE into a Date object, and String(thatDate) is
 * 'Mon Aug 03 2026 00:00:00 GMT+0000 (...)', which slices to 'Mon Aug 03',
 * splits to nothing numeric, and falls through to printing the whole thing.
 * Every date in the app rendered that way.
 *
 * Fixing it here rather than in formatDate() keeps the contract the ~37
 * date-column usages across the UI already assume, instead of teaching each
 * of them about a second possible shape.
 *
 * A Date is also the wrong type for these on principle: `reading_date` and
 * friends are calendar days with no time and no zone, and turning them into
 * an instant is what re-introduces the midnight/timezone drift that
 * date-helpers.js exists to avoid. timestamptz (created_at) is deliberately
 * left as a Date - it is a real instant, and the one place it is used only
 * compares two of them.
 */
types.setTypeParser(types.builtins.DATE, (value) => value);

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'pump',
      user: process.env.PGUSER || 'app_user',
      password: process.env.PGPASSWORD,
      max: 10,
    });
  }
  return pool;
}

/**
 * Runs fn(client) inside one transaction with app.current_user_id set to
 * userId for its whole duration, so every RLS policy fn's statements hit sees
 * the same signed-in user current_uid() in the database expects. Commits on
 * success; rolls back and rethrows on error, same as a failed Supabase RPC
 * would have left nothing written.
 *
 * SET LOCAL rather than SET: it only lasts for the transaction, so a pooled
 * connection handed back to the pool can never carry one request's identity
 * into another's.
 */
export async function withUser(userId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (userId) {
      await client.query('select set_config($1, $2, true)', ['app.current_user_id', userId]);
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Same as withUser, but with no identity set - for the handful of calls that
 * happen before a session exists at all: checking a login, creating the first
 * owner account, resolving a session cookie to a user id. Those all go through
 * SECURITY DEFINER functions (002_identity_and_sessions.sql) that do not rely
 * on current_uid(), by design.
 */
export async function withSystem(fn) {
  return withUser(null, fn);
}
