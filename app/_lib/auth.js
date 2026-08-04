/**
 * Session cookie handling - replaces supabase-auth.js.
 *
 * There is no GoTrue here, so this owns everything it used to hand off to
 * Supabase Auth: checking a password, issuing a session, reading it back on
 * later requests, signing out.
 *
 * The password itself is never compared here - verify_login() in
 * 002_identity_and_sessions.sql does that entirely in SQL with pgcrypto, so a
 * password hash never has to leave the database. This file only ever handles
 * a session id: a random, unguessable value that means nothing on its own.
 *
 * The cookie is sealed (encrypted + signed) with iron-session rather than
 * left as a bare session id, so a compromised browser profile cannot be used
 * to forge a different one - the session id inside still has to match a live
 * row in `sessions` for session_user_id() to return anything.
 *
 * `secure: false` on the cookie is deliberate, not an oversight: this app
 * only ever runs on 127.0.0.1, http, in Electron's own Chromium view - there
 * is no network hop for a `secure` flag to protect against.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { withSystem } from './db';

const COOKIE_NAME = 'pump_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is not set (or is too short). electron/bootstrap-db.js generates one ' +
        'on first run and passes it to the Next.js child process - if you are running ' +
        '`next dev` directly, add a 32+ character SESSION_SECRET to .env.local.',
    );
  }
  return secret;
}

async function readSessionId() {
  const jar = await cookies();
  const sealed = jar.get(COOKIE_NAME)?.value;
  if (!sealed) return null;

  try {
    const data = await unsealData(sealed, { password: sessionSecret() });
    return data.sessionId ?? null;
  } catch {
    // Tampered, expired, or signed with a since-rotated secret. Treat as
    // signed out rather than throwing - a stale cookie is not an error.
    return null;
  }
}

async function writeSessionCookie(sessionId) {
  const jar = await cookies();
  const sealed = await sealData(
    { sessionId },
    { password: sessionSecret(), ttl: SESSION_TTL_SECONDS },
  );
  jar.set(COOKIE_NAME, sealed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });
}

/**
 * Checks email/password, and on success starts a session and sets the cookie.
 * Returns the signed-in profile, or null if the credentials were wrong -
 * deliberately the same answer either way, so a login form cannot be used to
 * probe which emails exist.
 */
export async function login(email, password) {
  const profile = await withSystem(async (client) => {
    const { rows } = await client.query('select * from verify_login($1, $2)', [email, password]);
    return rows[0] ?? null;
  });

  if (!profile) return null;

  const sessionId = await withSystem(async (client) => {
    const { rows } = await client.query('select create_session($1) as id', [profile.id]);
    return rows[0].id;
  });

  await writeSessionCookie(sessionId);

  return profile;
}

/** Ends the current session, in the database and in the browser. */
export async function logout() {
  const sessionId = await readSessionId();
  if (sessionId) {
    await withSystem((client) => client.query('select delete_session($1)', [sessionId]));
  }
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * The signed-in user's profile, or null.
 *
 * Resolves the session cookie to a user id via session_user_id() (SECURITY
 * DEFINER - the sessions table itself has no RLS policies open to app_user at
 * all, see 002), then sets that id as the request's identity before reading
 * the profile row, so the "read own" RLS policy on profiles is satisfied by
 * construction rather than bypassed. A deactivated account is treated as
 * signed out.
 */
export async function getSessionProfile() {
  const sessionId = await readSessionId();
  if (!sessionId) return null;

  return withSystem(async (client) => {
    const { rows: sessionRows } = await client.query('select session_user_id($1) as user_id', [
      sessionId,
    ]);
    const userId = sessionRows[0]?.user_id;
    if (!userId) return null;

    await client.query('select set_config($1, $2, true)', ['app.current_user_id', userId]);

    const { rows } = await client.query(
      'select id, email, full_name, role, is_active from profiles where id = $1',
      [userId],
    );
    const profile = rows[0];
    if (!profile || !profile.is_active) return null;

    return profile;
  });
}
