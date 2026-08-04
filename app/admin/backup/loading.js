export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-40 rounded bg-ink-200" />
      <div className="space-y-6">
        <div className="h-24 rounded-xl bg-ink-200" />
        <div className="h-20 rounded-xl bg-ink-200" />
        <div className="h-32 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading backup…</span>
    </div>
  );
}
