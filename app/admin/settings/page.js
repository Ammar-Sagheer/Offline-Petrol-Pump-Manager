import { requirePageRole, ROLES, formatDate, formatPKR, fullResetAllowed } from '@/app/_lib/helpers';
import { getTanks, getNozzles, getFuelPrices, getCurrentRates } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import FuelPriceForm from '@/app/_components/admin/FuelPriceForm';
import TankForm from '@/app/_components/admin/TankForm';
import NozzleSettingsButton from '@/app/_components/admin/NozzleSettingsButton';
import FullResetPanel from '@/app/_components/admin/FullResetPanel';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const [tanks, nozzles, prices, rates] = await Promise.all([
    getTanks(),
    getNozzles(),
    getFuelPrices(),
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
        <NozzleSettingsButton nozzles={nozzles} tanks={tanks} />
      </PageHeader>

      {/* ---- pricing ---- */}
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Fuel prices</h2>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] [&>*]:min-w-0">
        <FuelPriceForm currentRates={rates} />

        <div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {['petrol', 'diesel'].map((fuelType) => (
              <div key={fuelType} className="card p-4">
                <div className="flex items-center justify-between">
                  <FuelBadge fuelType={fuelType} />
                  <span className="text-xs text-ink-500">current rate</span>
                </div>
                <p className="tabular mt-2 text-2xl font-bold text-ink-900">
                  {rates[fuelType] === null ? (
                    <span className="text-base font-semibold text-amber-700">Not set</span>
                  ) : (
                    `${formatPKR(rates[fuelType])} / L`
                  )}
                </p>
              </div>
            ))}
          </div>

          {prices.length > 0 ? (
            <div className="card table-scroll">
              <table className="w-full min-w-[26rem]">
                <thead className="border-b border-ink-200 bg-ink-50">
                  <tr>
                    <th className="th">Fuel</th>
                    <th className="th">In force from</th>
                    <th className="th text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {prices.map((price) => (
                    <tr key={price.id}>
                      <td className="td">
                        <FuelBadge fuelType={price.fuel_type} />
                      </td>
                      <td className="td">{formatDate(price.effective_from)}</td>
                      <td className="td-num font-semibold">{formatPKR(price.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="card px-4 py-6 text-center text-sm text-ink-500">
              No rates set yet. Readings cannot be entered until a rate exists for each fuel.
            </p>
          )}
        </div>
      </div>

      {/* ---- tanks ---- */}
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-ink-500">Tanks</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tanks.map((tank) => (
          <TankForm key={tank.id} tank={tank} />
        ))}
      </div>

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
