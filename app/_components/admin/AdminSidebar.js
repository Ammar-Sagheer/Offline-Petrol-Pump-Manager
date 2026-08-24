'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import PendingLink from '@/app/_components/ui/PendingLink';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Icon from '@/app/_components/ui/Icon';
import BrandMark from '@/app/_components/ui/BrandMark';
import { signOut } from '@/app/_lib/actions';
import { useBrand } from '@/app/_components/ui/BrandProvider';

/**
 * The app's navigation: a column down the left on a laptop, a drawer behind a
 * burger on a phone.
 *
 * WHY A COLUMN RATHER THAN A ROW OF TABS. There are ten sections, and with an
 * icon and a readable label each they need about 1350px laid out sideways -
 * more than the page has. As a top bar they either scrolled, hiding Reports and
 * Settings off the right-hand edge of every laptop, or wrapped onto a second
 * row that ate the top of every screen. Vertically there is no such squeeze:
 * ten items fit down the side of even a short window with room left over, all
 * visible at once, which is what someone still learning where things live
 * needs. It also gives each one a full-width band to hit rather than a word.
 *
 * WHY IT COSTS SOMETHING. 240px off the left means the widest table in the app
 * - Purchases, eight columns - scrolls inside its own card at 1024px, where
 * before it just fitted. That is the trade: a nav that is always visible
 * against one table that scrolls at one width. It scrolls inside the card, not
 * the page, so nothing else moves.
 *
 * The links a data_entry user cannot open are not rendered. This is
 * presentation only - typing the URL still hits requirePageRole(), and RLS
 * would refuse the data even then.
 *
 * Account and Sign out sit at the bottom, apart from the sections: they are
 * "about you", not a part of the app someone works in. Reports and Settings
 * come last among the sections for the same reason, being looked at
 * occasionally rather than worked in all day.
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard', roles: ['super_admin'] },
  {
    href: '/admin/readings',
    label: 'Readings',
    icon: 'readings',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/lubricants',
    label: 'Lubricants',
    icon: 'lubricants',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/purchases',
    label: 'Purchases',
    icon: 'purchases',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/stock-checks',
    label: 'Stock',
    icon: 'stock',
    roles: ['super_admin', 'data_entry'],
  },
  {
    href: '/admin/customers',
    label: 'Customers',
    icon: 'customers',
    roles: ['super_admin', 'data_entry'],
  },
  { href: '/admin/banking', label: 'Banking', icon: 'banking', roles: ['super_admin'] },
  // Directly under Banking, because the two are the same question asked of two
  // different places money sits - what is in the account, what is in the safe -
  // and the owner moves between them in one sitting when he banks the day's
  // cash. Its own entry rather than a tab on Banking: none of this money is in
  // the banking system, and burying it inside the page about accounts is how
  // it would get read as one.
  { href: '/admin/treasury', label: 'Treasury', icon: 'treasury', roles: ['super_admin'] },
  { href: '/admin/expenses', label: 'Expenses', icon: 'expenses', roles: ['super_admin'] },
  // Property the pump has bought and kept, not spending or takings - its own
  // entry beside Expenses and Banking rather than a tab on either, because it
  // answers a different question ("what do we own") from both.
  {
    href: '/admin/company-assets',
    label: 'Company Assets',
    icon: 'assets',
    roles: ['super_admin'],
  },
  { href: '/admin/reports', label: 'Reports', icon: 'reports', roles: ['super_admin'] },
  { href: '/admin/settings', label: 'Settings', icon: 'settings', roles: ['super_admin'] },
  // Offline-only. Copying the data folder is this build's substitute for the
  // Supabase dashboard nobody has here, so it needs somewhere to live in the
  // nav - owner only, same as Settings.
  { href: '/admin/backup', label: 'Backup', icon: 'backup', roles: ['super_admin'] },
  // Last, and open to both roles - the person most likely to need it is a new
  // member of staff on their first evening, not the owner.
  //
  // `prefetch` is set on this one alone. Measured on a production build, it
  // takes the navigation from 874ms with a loading skeleton to 70ms with none
  // at all - and the guide is the only section where it is free of any
  // consequence, because its content is a compile-time constant in
  // guide-content.js. There is no query to run early and nothing that can go
  // stale between the prefetch and the click.
  //
  // NOT DONE FOR THE OTHER TEN, and the reason is cost rather than staleness.
  // App Router prefetches when a link enters the viewport, and the whole
  // sidebar is in the viewport on a laptop - so prefetching all of them would
  // run ten full page renders, with their queries, on every single admin page
  // view. On a cheap tablet over mobile data those ten requests compete with
  // the page the reader is actually waiting for, which is the opposite of the
  // intent.
  {
    href: '/admin/guide',
    label: 'Guide',
    icon: 'guide',
    roles: ['super_admin', 'data_entry'],
    prefetch: true,
  },
  // Below the Guide and owner-only, which is the whole point of where it sits:
  // it is the one section that is about the people using the app rather than
  // about the pump, and a staff member should not be watching it any more than
  // they should be reading Reports. Hiding the link is cosmetic - the page
  // calls requirePageRole() and the row-level policy on activity_log refuses
  // the data to anyone but the owner regardless.
  { href: '/admin/activity', label: 'Activity', icon: 'activity', roles: ['super_admin'] },
];

export default function AdminSidebar({ profile }) {
  // Licence-derived here rather than a constant in brand.js - see
  // docs/LICENSING_PLAN.md and the <BrandProvider> in admin/layout.js.
  const { businessName } = useBrand();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef(null);

  const visibleLinks = LINKS.filter((link) => link.roles.includes(profile.role));

  function isActive(href) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  /*
   * The drawer is a real <dialog> opened with showModal(), so focus trapping,
   * Escape and an inert page behind it all come from the browser already
   * correct - the same reasoning as ui/Dialog.js.
   */
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    if (isOpen && !drawer.open) drawer.showModal();
    else if (!isOpen && drawer.open) drawer.close();
  }, [isOpen]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    const handleClose = () => setIsOpen(false);
    drawer.addEventListener('close', handleClose);
    return () => drawer.removeEventListener('close', handleClose);
  }, []);

  /*
   * Close once the navigation has actually landed. Closing on the click
   * instead would pull the drawer away while the new page is still loading,
   * leaving a blank screen and no sign anything is happening - the pending
   * spinner on the link someone just pressed is the only feedback there is.
   */
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const roleLabel = profile.role === 'super_admin' ? 'Owner' : 'Data entry';

  /*
   * Two shapes for the same information, because the space is different.
   *
   * In a 240px column, "Mubeen Petroleum Service" beside a logo does not fit
   * on one line - laid out like the top bar it truncated to "Mubeen Petr...",
   * which is the pump's own name, on its own screen, cut in half. Sat beside
   * the logo it wrapped one word to a line. So down the side everything
   * stacks and centres over the column's full width: the logo, then the name,
   * then the person and their role.
   *
   * Across the top of a phone there is room for one line each, and wrapping
   * there would push the day's work further down, so that one keeps the
   * truncating layout it always had.
   */
  const identityStacked = (
    <div className="min-w-0 text-center">
      <BrandMark className="mx-auto h-10" />
      <p className="mt-1.5 text-sm font-bold leading-tight text-ink-900">{businessName}</p>
      <p className="mt-0.5 text-xs text-ink-600">
        {profile.full_name}
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        {roleLabel}
      </p>
    </div>
  );

  const identityInline = (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark className="h-10" />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-ink-900">{businessName}</p>
        <p className="truncate text-sm text-ink-600">
          {profile.full_name}
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          {roleLabel}
        </p>
      </div>
    </div>
  );

  function sectionLink(link) {
    const active = isActive(link.href);

    return (
      <li key={link.href}>
        <PendingLink
          href={link.href}
          prefetch={link.prefetch ?? undefined}
          aria-current={active ? 'page' : undefined}
          className={[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition',
            active
              ? 'bg-brand-50 font-semibold text-brand-800'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
          ].join(' ')}
        >
          <Icon name={link.icon} className="h-5 w-5" />
          {link.label}
          {active ? <ActiveMark /> : null}
        </PendingLink>
      </li>
    );
  }

  const accountBlock = (
    <div className="space-y-0.5 border-t border-ink-200 pt-2">
      <PendingLink
        href="/admin/account"
        aria-current={isActive('/admin/account') ? 'page' : undefined}
        className={[
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition',
          isActive('/admin/account')
            ? 'bg-brand-50 font-semibold text-brand-800'
            : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
        ].join(' ')}
      >
        <Icon name="account" className="h-5 w-5" />
        Account
        {isActive('/admin/account') ? <ActiveMark /> : null}
      </PendingLink>

      <form action={signOut}>
        <SubmitButton
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium
                     text-red-700 transition hover:bg-red-50"
          pendingLabel="Signing out…"
        >
          <Icon name="signOut" className="h-5 w-5" />
          Sign out
        </SubmitButton>
      </form>
    </div>
  );

  return (
    <>
      {/* ---------- laptop: a fixed column ---------- */}
      <aside
        aria-label="Sections"
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-200
                   bg-white lg:flex"
      >
        <div className="border-b border-ink-200 px-4 py-3">{identityStacked}</div>

        {/* Scrolls on its own if the window is short, so Settings is always
            reachable without the page moving. */}
        <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-0.5">{visibleLinks.map(sectionLink)}</ul>
        </nav>

        <div className="px-3 pb-3">{accountBlock}</div>
      </aside>

      {/* ---------- phone and tablet: a bar with a burger ---------- */}
      <header
        className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200
                   bg-white px-4 lg:hidden"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open the menu"
          aria-expanded={isOpen}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg
                     text-ink-700 transition hover:bg-ink-100
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Icon name="menu" className="h-6 w-6" />
        </button>

        {identityInline}
      </header>

      <dialog
        ref={drawerRef}
        aria-label="Sections"
        onClick={(event) => {
          // The backdrop is the dialog element itself, so this only fires when
          // the click missed the panel inside it.
          if (event.target === drawerRef.current) drawerRef.current.close();
        }}
        className="m-0 mr-auto h-dvh max-h-none w-[19rem] max-w-none bg-transparent p-0
                   backdrop:bg-ink-900/60 backdrop:backdrop-blur-sm lg:hidden"
      >
        <div className="flex h-full flex-col bg-white">
          {/* The close button is taken out of the flow rather than sitting
              beside the name: in a panel this narrow, a 40px button in the
              same row squeezed "Mubeen Petroleum Service" onto three lines. */}
          <div className="relative border-b border-ink-200 px-4 py-4 pr-14">
            {identityStacked}
            <button
              type="button"
              onClick={() => drawerRef.current?.close()}
              aria-label="Close the menu"
              className="absolute right-2 top-3 flex h-10 w-10 items-center justify-center
                         rounded-lg text-ink-600 transition hover:bg-ink-100"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>

          <nav className="nav-scroll flex-1 overflow-y-auto px-3 py-2">
            <ul className="space-y-0.5">{visibleLinks.map(sectionLink)}</ul>
          </nav>

          <div className="px-3 pb-4">{accountBlock}</div>
        </div>
      </dialog>
    </>
  );
}

/**
 * The dark bar at the right-hand end of whichever section is open.
 *
 * The tinted band and the greener label already said "you are here", but both
 * are soft: on a cheap tablet in daylight the brand-50 fill washes out to the
 * same white as the rest of the column, and then nothing on the screen says
 * which of thirteen sections is showing. A short hard line at the end of the
 * row survives that - it is the darkest thing in the nav, and it is somewhere
 * no other row has ink at all, so it reads as a marker rather than as one more
 * pale wash.
 *
 * `ml-auto` puts it against the far edge whatever the label's length, so the
 * markers line up down the column instead of trailing after each word. Purely
 * decorative: aria-current on the link is what a screen reader is told.
 */
function ActiveMark() {
  return (
    <span
      aria-hidden="true"
      className="ml-auto h-6 w-1 shrink-0 rounded-full bg-brand-800"
    />
  );
}
