export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-5 w-32 rounded bg-ink-200" />
      <div className="mb-6 h-9 w-48 rounded bg-ink-200" />
      <div className="h-[34rem] rounded-xl bg-ink-200" />
      <span className="sr-only">Loading the daily sales…</span>
    </div>
  );
}
