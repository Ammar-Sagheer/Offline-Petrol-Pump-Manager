export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-11 w-40 rounded bg-ink-200" />
      <div className="mb-6 h-9 w-64 rounded bg-ink-200" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="h-28 rounded-xl bg-ink-200" />
        <div className="h-28 rounded-xl bg-ink-200" />
        <div className="h-28 rounded-xl bg-ink-200" />
      </div>
      <div className="h-96 rounded-xl bg-ink-200" />
      <span className="sr-only">Loading the guide…</span>
    </div>
  );
}
