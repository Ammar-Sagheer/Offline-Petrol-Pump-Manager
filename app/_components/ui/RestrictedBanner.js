/**
 * Shown when this install is soft-restricted - see docs/LICENSING_PLAN.md,
 * "Restricting after the support date". Every page still renders and every
 * Server Action that only reads data still works; requireRole() (helpers.js)
 * is what actually refuses new entries, wherever someone tries to make one -
 * this banner just explains why up front rather than leaving it to be
 * discovered as a surprise error partway through a form.
 */
export default function RestrictedBanner() {
  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-900">
      This licence needs renewing. Your existing data is safe and can still be viewed and
      exported, but new entries are paused until this is resolved - contact your installer.
    </div>
  );
}
