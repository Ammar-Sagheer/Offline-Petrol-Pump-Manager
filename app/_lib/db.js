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
import { Pool } from 'pg';

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
