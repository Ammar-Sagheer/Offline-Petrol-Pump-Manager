'use client';

import { useState } from 'react';
import Button from '@/app/_components/ui/Button';
import RenewLicenceDialog from '@/app/_components/ui/RenewLicenceDialog';

/**
 * What this copy of the app is licensed as, and the way to renew it early.
 *
 * The renewal dialog is reachable from the red banner too, but only once a
 * licence has already lapsed - which is the worst moment to discover where
 * the button is. Here it sits on a screen the owner already visits, so a
 * client who is sent next year's licence in advance can activate it while
 * nothing is broken.
 *
 * The support date is shown because it is the one fact behind "why has this
 * stopped letting me enter readings", and until now it appeared nowhere in
 * the app at all - it was only legible by reading the .txt file the licence
 * arrived in, which nobody keeps.
 */
export default function LicencePanel({ licence, restricted }) {
  const [open, setOpen] = useState(false);

  const endsAt = licence?.su ? new Date(licence.su) : null;
  const ended = endsAt != null && endsAt < new Date();

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink-900">Licence</h3>
          <p className="mt-1 max-w-prose text-xs text-ink-600">
            {licence
              ? 'This copy is activated for this computer. Renewing replaces the licence in place - nobody is signed out and nothing needs restarting.'
              : 'This copy is not activated yet. Paste the licence your installer sent to activate it.'}
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
          {licence ? 'Renew licence' : 'Activate'}
        </Button>
      </div>

      {licence ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Business</dt>
            <dd className="mt-0.5 truncate text-ink-800">{licence.b}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Licence key
            </dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-ink-800">{licence.k}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Support until
            </dt>
            <dd className={`mt-0.5 ${ended ? 'font-semibold text-red-700' : 'text-ink-800'}`}>
              {licence.su}
              {ended ? ' (ended)' : ''}
            </dd>
          </div>
        </dl>
      ) : null}

      {/* Deliberately not the red banner's wording: that one is an
          interruption, this is a status line on a settings page. */}
      {restricted ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          New entries are paused on this install until the licence is renewed. Existing data stays
          viewable and exportable.
        </p>
      ) : null}

      <RenewLicenceDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
