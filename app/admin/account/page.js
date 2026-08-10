import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getProfiles } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import ChangePasswordSection from '@/app/_components/admin/ChangePasswordSection';
import StaffAccountForm from '@/app/_components/admin/StaffAccountForm';
import StaffList from '@/app/_components/admin/StaffList';

export const metadata = { title: 'Your account' };

/**
 * Your own login, and - for the owner - everyone else's too.
 *
 * The top of the page is open to both roles: managing OTHER people's accounts
 * is owner only, but the create-login form already tells staff to change their
 * password once they have signed in, and until now there was nowhere to do it.
 * A password handed over by someone else is not a password.
 *
 * Staff logins used to live under Settings, which was the wrong page for it -
 * Settings is prices and hardware, this page is already "accounts", and an
 * owner reads their own login details and everyone else's in the same glance
 * far more often than they read the two in different tabs.
 *
 * For the owner the two sit side by side rather than stacked: your own
 * details and the password form are a narrow column of short fields, which
 * left the rest of a normal-width screen sitting empty below the page header.
 * Staff logins takes that space instead of the row below it. Below lg there is
 * no spare width to put there, so it drops back to one column in the order it
 * is written here - your own account first, then everyone else's.
 */
export default async function AccountPage() {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const staff = isOwner ? await getProfiles() : null;

  const ownAccount = (
    <>
      <section className="card max-w-md p-4">
        <dl className="space-y-3">
          <div>
            <dt className="figure-label">Name</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900">{profile.full_name}</dd>
          </div>
          <div>
            <dt className="figure-label">Email</dt>
            <dd className="mt-0.5 break-all text-sm font-semibold text-ink-900">
              {profile.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="figure-label">Role</dt>
            <dd className="mt-0.5 text-sm font-semibold text-ink-900">
              {profile.role === ROLES.SUPER_ADMIN
                ? 'Owner — full access'
                : 'Data entry — daily figures only'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-600">
          The email and role can only be changed by the owner
          {isOwner ? ', in Staff logins' : ''}.
        </p>
      </section>

      <ChangePasswordSection />
    </>
  );

  return (
    <>
      <PageHeader
        title="Your account"
        description="Your own sign-in details. Nobody else can see or change these."
      >
        {/* Owner only, and set up once per person rather than every visit -
            the same reasoning that put adding a bank account behind a dialog. */}
        {isOwner ? <StaffAccountForm /> : null}
      </PageHeader>

      {isOwner ? (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
          <div className="space-y-6">{ownAccount}</div>

          <div>
            <h2 className="section-heading">
              Staff logins
            </h2>
            <StaffList staff={staff} currentProfileId={profile.id} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">{ownAccount}</div>
      )}
    </>
  );
}
