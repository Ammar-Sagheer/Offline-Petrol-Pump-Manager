'use client';

/**
 * Shared tooltip for every chart in the app.
 *
 * The label text stays in the normal ink colours - a small colour chip beside
 * each row carries the series identity instead. Colouring the text itself would
 * make identity depend on colour alone, and would read badly against the
 * surface for the lighter series.
 */
export default function ChartTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-ink-900">{label}</p>
      <ul className="space-y-1">
        {payload.map((item) => (
          <li key={item.dataKey} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-ink-600">{item.name}</span>
            <span className="tabular ml-auto font-semibold text-ink-900">
              {formatValue ? formatValue(item.value) : item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
