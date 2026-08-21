import {
  requirePageRole,
  ROLES,
  formatDate,
  formatRate,
  fullResetAllowed,
} from '@/app/_lib/helpers';
import {
  getTanks,
  getNozzles,
  getRetiredNozzles,
  getRecentFuelPrices,
  getCurrentRates,
} from '@/app/_lib/data-service';
import { storedLicence, isRestricted } from '@/app/_lib/licence';
import PageHeader from '@/app/_components/ui/PageHeader';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import FuelPriceForm from '@/app/_components/admin/FuelPriceForm';
import TankForm from '@/app/_components/admin/TankForm';
import NozzleSettingsButton from '@/app/_components/admin/NozzleSettingsButton';
import FullResetPanel from '@/app/_components/admin/FullResetPanel';
import LicencePanel from '@/app/_components/admin/LicencePanel';
import FuelPriceTable from '@/app/_components/admin/FuelPriceTable';
import PendingLink from '@/app/_components/ui/PendingLink';

export const metadata = { title: 'Settings' };

/* Five changes on this page, the rest behind "View all". The rate moves most
   days, so left unbounded this table grew by two rows a day and turned the
   pricing panel into a wall nobody read. Seven whole days was the first cut at
   that and still ran to fourteen rows and a scrollbar; five rows is a glance.
   getRecentFuelPrices() rounds up to the end of a date rather than splitting a
   day's petrol and diesel, so this can show six. */
const RECENT_ROWS = 5;

export default async function SettingsPage() {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const [tanks, nozzles, retiredNozzles, prices, rates] = await Promise.all([
    getTanks(),
    getNozzles(),
    getRetiredNozzles(),
    getRecentFuelPrices(RECENT_ROWS),
    getCurrentRates(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Prices, hardware and who can sign in. Owner access only."
      >
        {/* Set up once and rarely touched again, same reasoning as adding a
            bank account: it does not deserve a form standing open on the page
            for the rest of this screen's life. */}
        <NozzleSettingsButton nozzles={nozzles} tanks={tanks} retiredNozzles={retiredNozzles} />
      </PageHeader>

      {/* ---- pricing ---- */}
      <h2 className="section-heading">Fuel prices</h2>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
        <FuelPriceForm currentRates={rates} />

        <div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {['petrol', 'diesel'].map((fuelType) => (
              <div key={fuelType} className="card p-4">
                <div className="flex items-center justify-between">
                  <FuelBadge fuelType={fuelType} />
                  <span className="text-sm text-ink-600">current rate</span>
                </div>
                <p className="tabular mt-2 text-2xl font-bold text-ink-900">
                  {rates[fuelType] === null ? (
                    <span className="text-base font-semibold text-amber-700">Not set</span>
                  ) : (
                    `${formatRate(rates[fuelType])} / L`
                  )}
                </p>
              </div>
            ))}
          </div>

          {prices.length > 0 ? (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-ink-600">The most recent changes</p>
                <PendingLink
                  href="/admin/settings/fuel-prices"
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  View all rates
                </PendingLink>
              </div>

              <FuelPriceTable prices={prices} />
            </>
          ) : (
            <p className="card px-4 py-6 text-center text-base text-ink-600">
              No rates set yet. Readings cannot be entered until a rate exists for each fuel.
            </p>
          )}
        </div>
      </div>

      {/* ---- tanks ---- */}
      <h2 className="section-heading">Tanks</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tanks.map((tank) => (
          <TankForm key={tank.id} tank={tank} />
        ))}
      </div>

      {/* ---- licence ---- */}
      {/* Last, under the things touched daily: this is a once-a-year screen,
          and read fresh off licence.json rather than from the memoised
          getLicence() so a renewal done in the dialog below shows its new
          date immediately - see storedLicence(). */}
      <h2 className="section-heading">Licence</h2>
      <LicencePanel licence={storedLicence()} restricted={isRestricted()} />

      {/* Testing scaffolding. Gone the moment ALLOW_FULL_RESET is removed from
          the server, with no code change - see fullResetAllowed(). */}
      {fullResetAllowed() ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-red-700">
            While testing
          </h2>
          <FullResetPanel />
        </>
      ) : null}
    </>
  );
}
