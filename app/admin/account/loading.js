export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-48 rounded bg-ink-200" />
      <div className="mb-6 h-44 max-w-md rounded-xl bg-ink-200" />
      <div className="mb-3 h-4 w-40 rounded bg-ink-200" />
      <div className="h-72 max-w-md rounded-xl bg-ink-200" />
      <span className="sr-only">Loading your account…</span>
    </div>
  );
}
