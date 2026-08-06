import '@/app/_styles/globals.css';

import { licensedBusinessName } from '@/app/_lib/licence';

/**
 * Async because the business name now comes from the licence token, only
 * known at run time - a plain `metadata` export can only ever see build-time
 * values. See docs/LICENSING_PLAN.md, "Making BUSINESS_NAME licence-derived".
 */
export async function generateMetadata() {
  const businessName = licensedBusinessName();
  return {
    title: {
      default: businessName,
      template: `%s · ${businessName}`,
    },
    description: 'Daily readings, stock and customer credit for the petrol pump.',
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // The daily entry screen is used on a tablet; let it be zoomed.
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
