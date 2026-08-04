/**
 * Petrol and diesel keep the same two colours everywhere in the app - in
 * badges, in table rows and in the dashboard charts - so the fuel type can be
 * recognised without reading the label.
 */
const STYLES = {
  petrol: 'bg-sky-100 text-sky-800',
  diesel: 'bg-amber-100 text-amber-900',
};

export default function FuelBadge({ fuelType }) {
  if (!fuelType) return null;

  return (
    <span className={`badge ${STYLES[fuelType] ?? 'bg-ink-100 text-ink-700'}`}>
      {fuelType === 'petrol' ? 'Petrol' : fuelType === 'diesel' ? 'Diesel' : fuelType}
    </span>
  );
}
