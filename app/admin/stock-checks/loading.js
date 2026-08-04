export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-52 rounded bg-ink-200" />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="h-80 rounded-xl bg-ink-200" />
        <div className="h-80 rounded-xl bg-ink-200" />
      </div>
      <div className="h-64 rounded-xl bg-ink-200" />
      <span className="sr-only">Loading stock checks…</span>
    </div>
  );
}
