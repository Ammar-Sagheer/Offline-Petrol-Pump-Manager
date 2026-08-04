export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-56 rounded bg-ink-200" />
      <div className="mb-6 h-20 rounded-xl bg-ink-200" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 rounded-xl bg-ink-200" />
        ))}
      </div>
      <span className="sr-only">Loading the day’s readings…</span>
    </div>
  );
}
