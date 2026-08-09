import { getSessionProfile } from '@/app/_lib/helpers';
import {
  licensedBusinessName,
  licensedBusinessInitials,
  graceUntil,
  isRestricted,
} from '@/app/_lib/licence';
import AdminSidebar from '@/app/_components/admin/AdminSidebar';
import { BrandProvider } from '@/app/_components/ui/BrandProvider';
import GraceBanner from '@/app/_components/ui/GraceBanner';
import RestrictedBanner from '@/app/_components/ui/RestrictedBanner';

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
 * the login page redirecting to itself. (Setup and login read the licence and
 * wrap themselves in their own <BrandProvider> for the same reason - they are
 * reached through this branch, so they never get the one below.)
 *
 * The sidebar is fixed rather than a flex sibling, so a long page scrolls under
 * a nav that stays put. `lg:pl-60` is what keeps the content clear of it; the
 * two numbers have to agree, and they are the only two places 60 appears.
 *
 * THE BANNERS SIT OUTSIDE THE PADDED COLUMN, above the sidebar rather than
 * beside it. A licence warning that only appeared in the content column would
 * be missed on the one screen where it matters most - and the sidebar is
 * fixed, so anything drawn next to it would scroll away from the message.
 */
export default async function AdminLayout({ children }) {
  const profile = await getSessionProfile();

  if (!profile) {
    return children;
  }

  const until = graceUntil();
  const restricted = isRestricted();

  return (
    <BrandProvider businessName={licensedBusinessName()} initials={licensedBusinessInitials()}>
      <div className="min-h-screen lg:pl-60">
        {until ? <GraceBanner until={until} /> : null}
        {restricted ? <RestrictedBanner /> : null}
        <AdminSidebar profile={profile} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      </div>
    </BrandProvider>
  );
}
