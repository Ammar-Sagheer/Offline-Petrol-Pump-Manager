'use client';

import PendingLink from '@/app/_components/ui/PendingLink';
import { usePathname } from 'next/navigation';

import { signOut } from '@/app/_lib/actions';
import { BUSINESS_NAME } from '@/app/_lib/brand';
import BrandMark from '@/app/_components/ui/BrandMark';

/**
 * The links a data_entry user cannot open are not rendered at all.
 *
 * This is presentation only. Hiding a link stops an honest mistake; it stops
 * nothing else. Typing the URL by hand still hits requirePageRole(), and the
 * RLS policies would refuse the data even then.
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', roles: ['super_admin'] },
  { href: '/admin/readings', label: 'Readings', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/purchases', label: 'Purchases', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/stock-checks', label: 'Stock', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/customers', label: 'Customers', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/banking', label: 'Banking', roles: ['super_admin'] },
  { href: '/admin/reports', label: 'Reports', roles: ['super_admin'] },
  { href: '/admin/settings', label: 'Settings', roles: ['super_admin'] },
  { href: '/admin/backup', label: 'Backup', roles: ['super_admin'] },
  { href: '/admin/account', label: 'Account', roles: ['super_admin', 'data_entry'] },
];

export default function AdminNavbar({ profile }) {
  const pathname = usePathname();
  const visibleLinks = LINKS.filter((link) => link.roles.includes(profile.role));

  function isActive(href) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-11" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{BUSINESS_NAME}</p>
              <p className="truncate text-xs text-ink-500">
                {profile.full_name}
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                {profile.role === 'super_admin' ? 'Owner' : 'Data entry'}
              </p>
            </div>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Sign out
            </button>
          </form>
        </div>

        {/* Scrolls sideways on a phone rather than wrapping into two rows. */}
        <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1 pb-px">
            {visibleLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href}>
                  <PendingLink
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
                      active
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900',
                    ].join(' ')}
                  >
                    {link.label}
                  </PendingLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
