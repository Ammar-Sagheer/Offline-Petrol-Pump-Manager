/**
 * The headline figures at the top of the dashboard.
 *
 * These are stat tiles rather than a chart on purpose: four single numbers with
 * no trend to show are read faster as text than as any plot.
 */
export function StatTile({ label, value, sub, tone = 'default' }) {
  const valueTone =
    tone === 'positive' ? 'text-brand-700' : tone === 'negative' ? 'text-red-700' : 'text-ink-900';

  return (
    <div className="bg-white px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold ${valueTone}`}>{value}</p>
      {sub ? <p className="tabular mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}

export function StatGrid({ children, columns = 4 }) {
  const columnClass = columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <section className={`card grid grid-cols-2 gap-px overflow-hidden bg-ink-200 ${columnClass}`}>
      {children}
    </section>
  );
}
