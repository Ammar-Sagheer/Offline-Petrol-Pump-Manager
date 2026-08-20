'use client';

import { useEffect, useState } from 'react';
import RenewLicenceDialog from '@/app/_components/ui/RenewLicenceDialog';

/**
 * Shown when this install is soft-restricted - see docs/LICENSING_PLAN.md,
 * "Restricting after the support date". Every page still renders and every
 * Server Action that only reads data still works; requireRole() (helpers.js)
 * is what actually refuses new entries, wherever someone tries to make one -
 * this banner just explains why up front rather than leaving it to be
 * discovered as a surprise error partway through a form.
 *
 * It also carries the way out. The dialog opens by itself the first time a
 * restricted install renders an admin page, because the banner alone had one
 * failure mode worth designing against: it says "contact your installer" and
 * then offers nothing to do about it, so a client who has ALREADY been sent a
 * renewal has no idea where to put it. Dismissing the dialog leaves the
 * banner and its Renew button standing.
 */

// Once per run of the app, not once per navigation. sessionStorage is exactly
// that lifetime here - the renderer's session ends when the window closes -
// and a modal that reappeared on every page change would fight the promise
// the banner itself makes, that existing data stays usable.
const PROMPTED_KEY = 'pump-manager:renew-prompted';

export default function RestrictedBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PROMPTED_KEY)) return;
      sessionStorage.setItem(PROMPTED_KEY, '1');
    } catch {
      // Private-mode or a locked-down profile: showing the dialog once more
      // than intended is a far better failure than never showing it.
    }
    setOpen(true);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-900">
        <span>
          This licence needs renewing. Your existing data is safe and can still be viewed and
          exported, but new entries are paused until this is resolved - contact your installer.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-800
                     transition hover:bg-red-100
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          Renew now
        </button>
      </div>

      <RenewLicenceDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
