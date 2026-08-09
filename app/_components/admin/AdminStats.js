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
      <p className="figure-label">{label}</p>
        {/* nowrap, and a step smaller on a phone. "Rs 4,386,211" in a
          half-width tile was breaking after the "Rs", which reads for a moment
          as two separate figures - the one thing a money tile must never do. */}
      <p className={`tabular mt-1 whitespace-nowrap text-xl font-bold @[50rem]:text-2xl ${valueTone}`}>
        {value}
      </p>
      {sub ? <p className="tabular mt-0.5 text-sm text-ink-600">{sub}</p> : null}
    </div>
  );
}

export function StatGrid({ children, columns = 4 }) {
  const columnClass = columns === 2 ? '' : '@[50rem]:grid-cols-4';

  /*
   * The column count follows the WIDTH OF THIS GRID, not the width of the
   * window - hence @container and the @[..] variants rather than sm: and lg:.
   *
   * Those are not the same number any more. The sidebar takes 240px off the
   * left, so at a 1024px window this grid has about 768px to work in. Asked
   * for four columns at the `lg` viewport breakpoint it gave each tile 192px,
   * and "Rs 4,386,211" at 24px needs more than that - the figures ran into
   * their own dividers. Measured against the grid itself, four columns wait
   * until there is genuinely room for them.
   *
   * The bottom end is the same problem from the other side: two tiles across
   * a 320px phone leaves about 130px each, where the number either broke
   * after the "Rs" - two lines that read for a moment as two figures - or ran
   * out of its tile. One per row until 24rem.
   */
  return (
    <div className="@container">
      <section
        className={`card grid grid-cols-1 gap-px overflow-hidden bg-ink-200 @[24rem]:grid-cols-2 ${columnClass}`}
      >
        {children}
      </section>
    </div>
  );
}
