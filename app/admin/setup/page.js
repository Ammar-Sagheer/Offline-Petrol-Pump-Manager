import { redirect } from 'next/navigation';

import SetupForm from '@/app/_components/admin/SetupForm';
import BrandMark from '@/app/_components/ui/BrandMark';
import { BUSINESS_NAME } from '@/app/_lib/brand';
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

  return (
    <div className="card p-6">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandMark className="h-16" />
        <div>
          <h1 className="text-lg font-bold text-ink-900">{BUSINESS_NAME}</h1>
          <p className="text-sm text-ink-500">
            First time here - create the owner account to get started.
          </p>
        </div>
      </div>

      <SetupForm />
    </div>
  );
}
