'use client';

import { createContext, useContext } from 'react';

/**
 * Carries the licensed business name/initials from a Server Component (which
 * read them from the licence token) down to the Client Components that
 * display them - AdminNavbar and BrandMark. See docs/LICENSING_PLAN.md,
 * "Making BUSINESS_NAME licence-derived", for why this has to be a real
 * server-to-client path rather than an env var: Next inlines process.env
 * into client bundles at BUILD time, but the licence is only known at RUN
 * time.
 *
 * Every page that renders a brand-aware component wraps its own subtree in
 * one of these, each with its own server-read values - app/admin/layout.js
 * for the signed-in app, and app/admin/login/page.js /
 * app/admin/setup/page.js for themselves, since those sit outside that
 * layout's chrome. There is no default value: a BrandMark or AdminNavbar
 * rendered outside a BrandProvider is a real bug, and useBrand() throwing is
 * how it gets caught during development rather than silently showing the
 * wrong name.
 */
const BrandContext = createContext(null);

export function BrandProvider({ businessName, initials, children }) {
  return (
    <BrandContext.Provider value={{ businessName, initials }}>{children}</BrandContext.Provider>
  );
}

export function useBrand() {
  const value = useContext(BrandContext);
  if (!value) {
    throw new Error('useBrand() was called outside a <BrandProvider>.');
  }
  return value;
}
