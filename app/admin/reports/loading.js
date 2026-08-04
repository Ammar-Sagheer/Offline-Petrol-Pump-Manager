export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-44 rounded bg-ink-200" />
      <div className="mb-6 h-28 rounded-xl bg-ink-200" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-ink-200" />
        <div className="h-24 rounded-xl bg-ink-200" />
        <div className="h-24 rounded-xl bg-ink-200" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 rounded-xl bg-ink-200" />
        <div className="h-80 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading reports…</span>
    </div>
  );
}
