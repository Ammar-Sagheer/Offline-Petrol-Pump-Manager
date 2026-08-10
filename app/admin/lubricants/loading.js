export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-56 rounded bg-ink-200" />
      <div className="mb-6 h-20 rounded-xl bg-ink-200" />
      <div className="h-72 rounded-xl bg-ink-200" />
      <span className="sr-only">Loading the day’s lubricant sales…</span>
    </div>
  );
}
