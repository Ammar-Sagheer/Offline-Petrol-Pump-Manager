export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-48 rounded bg-ink-200" />
      <div className="mb-8 h-24 rounded-xl bg-ink-200" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="h-32 rounded-xl bg-ink-200" />
        <div className="h-32 rounded-xl bg-ink-200" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 rounded-xl bg-ink-200" />
        <div className="h-80 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading the dashboard…</span>
    </div>
  );
}
