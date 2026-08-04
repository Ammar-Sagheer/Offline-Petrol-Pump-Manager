import { redirect } from 'next/navigation';

import LoginForm from '@/app/_components/admin/LoginForm';
import BrandMark from '@/app/_components/ui/BrandMark';
import { BUSINESS_NAME } from '@/app/_lib/brand';
import { anyProfilesExist } from '@/app/_lib/data-service';

/**
 * There is no signup link, and there never should be. Accounts are created by
 * the owner from Settings - except the very first one, which does not exist
 * yet on a brand new install, so this redirects to /admin/setup instead of
 * showing a login form nobody could possibly use.
 */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === 'string' ? params.next : '';

  const setUp = await anyProfilesExist();
  if (!setUp) {
    redirect('/admin/setup');
  }

  return (
    <div className="card p-6">
      {/* Stacked and centred rather than beside the name. The card is only
          max-w-sm, so a logo big enough to be worth showing was squeezing
          "Mubeen Petroleum Service" onto two lines and leaving both cramped.
          Above the name it can be the size it deserves and the heading gets the
          full width back. */}
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandMark className="h-16" />
        <div>
          <h1 className="text-lg font-bold text-ink-900">{BUSINESS_NAME}</h1>
          <p className="text-sm text-ink-500">Sign in to continue</p>
        </div>
      </div>

      <LoginForm next={next} />
    </div>
  );
}
