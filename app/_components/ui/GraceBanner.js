/**
 * Shown for an existing, pre-licensing install running on its 14-day grace
 * window instead of being locked out - see docs/LICENSING_PLAN.md, "A grace
 * path for pre-licensing installs". Purely informational: activation itself
 * only ever happens in the Electron window shown before this app starts, so
 * there is nothing to click here, just a countdown and what it means.
 */
export default function GraceBanner({ until }) {
  const days = Math.max(0, Math.ceil((new Date(until) - Date.now()) / (24 * 60 * 60 * 1000)));

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      This install is not yet activated - running on a {days}-day grace period. Contact your
      installer for a licence before it ends.
    </div>
  );
}
