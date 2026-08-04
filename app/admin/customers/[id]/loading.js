export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-64 rounded bg-ink-200" />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <div className="h-52 rounded-xl bg-ink-200" />
          <div className="h-72 rounded-xl bg-ink-200" />
        </div>
        <div className="h-80 rounded-xl bg-ink-200" />
      </div>
      <span className="sr-only">Loading the customer…</span>
    </div>
  );
}
