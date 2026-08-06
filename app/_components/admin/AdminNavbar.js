'use client';

import PendingLink from '@/app/_components/ui/PendingLink';
import { usePathname } from 'next/navigation';

import { signOut } from '@/app/_lib/actions';
import { useBrand } from '@/app/_components/ui/BrandProvider';
import BrandMark from '@/app/_components/ui/BrandMark';

/**
 * The links a data_entry user cannot open are not rendered at all.
 *
 * This is presentation only. Hiding a link stops an honest mistake; it stops
 * nothing else. Typing the URL by hand still hits requirePageRole(), and the
 * RLS policies would refuse the data even then.
 *
 * Account is deliberately not in this list. It sits with Sign out instead, in
 * the row above - see the return below - because it is not a working section
 * of the app the way the rest of these are: nobody scans a nozzle reading and
 * then reaches for Account next, so it does not belong among the tabs someone
 * flicks between all day.
 *
 * `edge: true` marks Reports, Settings and Backup, the ones looked at
 * occasionally rather than worked in all day. They are pinned to the far right
 * of the row, apart from the six operational tabs someone actually flicks
 * between - see how `edge` is used in the render below. (Backup is
 * offline-only and has no counterpart in the web app; it belongs in this group
 * for the same reason Settings does.)
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', roles: ['super_admin'] },
  { href: '/admin/readings', label: 'Readings', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/purchases', label: 'Purchases', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/stock-checks', label: 'Stock', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/customers', label: 'Customers', roles: ['super_admin', 'data_entry'] },
  { href: '/admin/banking', label: 'Banking', roles: ['super_admin'] },
  { href: '/admin/reports', label: 'Reports', roles: ['super_admin'], edge: true },
  { href: '/admin/settings', label: 'Settings', roles: ['super_admin'], edge: true },
  { href: '/admin/backup', label: 'Backup', roles: ['super_admin'], edge: true },
];

export default function AdminNavbar({ profile }) {
  const { businessName } = useBrand();
  const pathname = usePathname();
  const visibleLinks = LINKS.filter((link) => link.roles.includes(profile.role));
  const mainLinks = visibleLinks.filter((link) => !link.edge);
  const edgeLinks = visibleLinks.filter((link) => link.edge);

  function isActive(href) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const onAccount = isActive('/admin/account');

  function tab(link) {
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
  }

  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-11" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{businessName}</p>
              <p className="truncate text-xs text-ink-500">
                {profile.full_name}
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                {profile.role === 'super_admin' ? 'Owner' : 'Data entry'}
              </p>
            </div>
          </div>

          {/* Account and Sign out, together: both are "about you", not a
              working section of the app, which is why Account is not in the
              tab row below - see the note on LINKS. */}
          <div className="flex shrink-0 items-center gap-2">
            <PendingLink
              href="/admin/account"
              aria-current={onAccount ? 'page' : undefined}
              className={[
                'btn-secondary px-3 py-1.5 text-xs',
                onAccount ? 'border-brand-300 bg-brand-50 text-brand-800' : '',
              ].join(' ')}
            >
              Account
            </PendingLink>

            <form action={signOut}>
              <button type="submit" className="btn-danger px-3 py-1.5 text-xs">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Scrolls sideways on a phone rather than wrapping into two rows.
            From lg up, Reports, Settings and Backup sit pinned to the far
            right - ml-auto on their list soaks up whatever space is left in
            the row - apart from the six tabs worked in all day, which stay
            left-packed with a little more breathing room between them. Below
            lg there is no spare width to make that grouping mean anything, so
            both groups sit in their natural left-to-right order instead. */}
        <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max items-center pb-px lg:w-full lg:min-w-0">
            <ul className="flex gap-1 lg:gap-3">{mainLinks.map(tab)}</ul>
            {edgeLinks.length > 0 ? (
              <ul className="flex gap-1 lg:ml-auto">{edgeLinks.map(tab)}</ul>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
