/**
 * Petrol and diesel keep the same two colours everywhere in the app - in
 * badges, in table rows and in the dashboard charts - so the fuel type can be
 * recognised without reading the label.
 *
 * Lubricants get a third colour rather than sharing one: they now appear in the
 * same purchase list as the two fuels, and a list where three things are told
 * apart only by their text is a list nobody scans.
 */
const STYLES = {
  petrol: 'bg-sky-100 text-sky-800',
  diesel: 'bg-amber-100 text-amber-900',
  lubricant: 'bg-violet-100 text-violet-800',
};

const LABELS = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  lubricant: 'Lubricant',
};

export default function FuelBadge({ fuelType }) {
  if (!fuelType) return null;

  return (
    <span className={`badge ${STYLES[fuelType] ?? 'bg-ink-100 text-ink-700'}`}>
      {LABELS[fuelType] ?? fuelType}
    </span>
  );
}
