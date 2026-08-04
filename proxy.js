/**
 * Auth gate for every request.
 *
 * Next.js 16 renamed middleware.js to proxy.js - same idea, new name.
 *
 * This is a coarse gate only - it checks that a session cookie exists and is
 * not tampered with or expired, not what its owner's role is or whether the
 * account behind it is still active. Role checks belong in the pages
 * (requirePageRole), the Server Actions (requireRole) and above all in the
 * RLS policies. A session that was signed out or deactivated server-side but
 * whose cookie is still cryptographically valid gets past this gate and is
 * caught by getSessionProfile()'s database check on the page itself - the
 * same layering the reference app's Supabase-backed version had, where this
 * gate only refreshed/validated the JWT locally too.
 *
 * No database call here on purpose: iron-session's unsealData() already
 * verifies the cookie's signature and expiry entirely from the cookie itself,
 * so this stays fast on every request without needing Postgres to be involved
 * at all for something this coarse.
 */
import { NextResponse } from 'next/server';
import { unsealData } from 'iron-session';

async function hasValidSessionCookie(request) {
  const sealed = request.cookies.get('pump_session')?.value;
  if (!sealed) return false;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return false;

  try {
    const data = await unsealData(sealed, { password: secret });
    return Boolean(data?.sessionId);
  } catch {
    return false;
  }
}

export default async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isSignedIn = await hasValidSessionCookie(request);

  const isPublicAdminPage = pathname === '/admin/login' || pathname === '/admin/setup';
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdminArea && !isPublicAdminPage && !isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/admin/login' && isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
