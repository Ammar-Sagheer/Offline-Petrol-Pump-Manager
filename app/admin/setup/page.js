import { redirect } from 'next/navigation';

import SetupForm from '@/app/_components/admin/SetupForm';
import BrandMark from '@/app/_components/ui/BrandMark';
import { BrandProvider } from '@/app/_components/ui/BrandProvider';
import { licensedBusinessName, licensedBusinessInitials } from '@/app/_lib/licence';
import { anyProfilesExist } from '@/app/_lib/data-service';

export const metadata = {
  title: 'Set up',
};

/**
 * Shown exactly once per install: the first time the app is opened, before
 * any login exists. create_first_owner() (002_identity_and_sessions.sql)
 * refuses once a single profile exists, so this page is the only door - after
 * that, every other login is created by the owner from Settings.
 */
export default async function SetupPage() {
  const alreadySetUp = await anyProfilesExist();
  if (alreadySetUp) {
    redirect('/admin/login');
  }

  // Read directly and wrapped locally, same reasoning as login/page.js -
  // this page sits outside app/admin/layout.js's own <BrandProvider>.
  const businessName = licensedBusinessName();

  return (
    <BrandProvider businessName={businessName} initials={licensedBusinessInitials()}>
      <div className="card p-6">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-16" />
          <div>
            <h1 className="text-lg font-bold text-ink-900">{businessName}</h1>
            <p className="text-sm text-ink-500">
              First time here - create the owner account to get started.
            </p>
          </div>
        </div>

        <SetupForm />
      </div>
    </BrandProvider>
  );
}
