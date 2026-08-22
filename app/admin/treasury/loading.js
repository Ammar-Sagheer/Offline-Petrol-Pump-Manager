export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-40 rounded bg-ink-200" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-28 rounded-xl bg-ink-200" />
        <div className="h-28 rounded-xl bg-ink-200" />
        <div className="h-28 rounded-xl bg-ink-200" />
        <div className="h-28 rounded-xl bg-ink-200" />
      </div>
      <div className="mb-6 h-80 rounded-xl bg-ink-200" />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="h-[32rem] rounded-xl bg-ink-200" />
        <div className="h-96 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading the treasury…</span>
    </div>
  );
}
