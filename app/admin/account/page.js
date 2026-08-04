import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import PageHeader from '@/app/_components/ui/PageHeader';
import ChangePasswordForm from '@/app/_components/admin/ChangePasswordForm';

export const metadata = { title: 'Your account' };

/**
 * Your own login, and nothing else.
 *
 * Open to both roles deliberately. Managing OTHER people's accounts stays under
 * Settings, owner only - but the create-login form already tells staff to
 * change their password once they have signed in, and until now there was
 * nowhere to do it. A password handed over by someone else is not a password.
 */
export default async function AccountPage() {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  return (
    <>
      <PageHeader
        title="Your account"
        description="Your own sign-in details. Nobody else can see or change these."
      />

      <section className="card mb-6 max-w-md p-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Name</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900">{profile.full_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Email</dt>
            <dd className="mt-0.5 break-all text-sm font-semibold text-ink-900">
              {profile.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Role</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900">
              {profile.role === ROLES.SUPER_ADMIN
                ? 'Owner — full access'
                : 'Data entry — daily figures only'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink-500">
          The email and role can only be changed by the owner, under Settings.
        </p>
      </section>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        Change password
      </h2>
      <ChangePasswordForm />
    </>
  );
}
