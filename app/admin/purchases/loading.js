export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-56 rounded bg-ink-200" />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="h-[34rem] rounded-xl bg-ink-200" />
        <div className="h-96 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading fuel purchases…</span>
    </div>
  );
}
