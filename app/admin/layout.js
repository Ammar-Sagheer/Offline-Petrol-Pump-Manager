import { getSessionProfile } from '@/app/_lib/helpers';
import AdminNavbar from '@/app/_components/admin/AdminNavbar';

/**
 * Shell for everything under /admin.
 *
 * The gating happens in three places, deliberately:
 *   1. proxy.js turns away anyone not signed in before they reach here
 *   2. each page calls requirePageRole() for the role it needs
 *   3. RLS in the database refuses the query regardless
 *
 * This layout only decides what to draw. When there is no profile it renders
 * the page bare - that is the login screen, which lives under /admin/login and
 * therefore shares this layout. Checking for a session here as well would send
 * the login page redirecting to itself.
 */
export default async function AdminLayout({ children }) {
  const profile = await getSessionProfile();

  if (!profile) {
    return children;
  }

  return (
    <div className="min-h-screen">
      <AdminNavbar profile={profile} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
