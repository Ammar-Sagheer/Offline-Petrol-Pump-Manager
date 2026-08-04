import '@/app/_styles/globals.css';

import { BUSINESS_NAME } from '@/app/_lib/brand';

export const metadata = {
  title: {
    default: BUSINESS_NAME,
    template: `%s · ${BUSINESS_NAME}`,
  },
  description: 'Daily readings, stock and customer credit for the petrol pump.',
};

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
