'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { confirmRestore } from '@/app/_lib/actions';
import Dialog from '@/app/_components/ui/Dialog';
import SubmitButton from '@/app/_components/ui/SubmitButton';

/**
 * Restoring a backup - by browsing to a folder (a new or wiped machine, or
 * from the sign-in screen before anyone has authenticated at all), by
 * restoring one of the in-app backup list's own entries, or by undoing the
 * most recent restore. All of them end up calling the same
 * window.pumpManager.restoreFromBackup() bridge - see
 * docs/RESTORE_FROM_BACKUP.md and electron/preload.js.
 *
 * This overwrites live financial data, so by default it follows the same
 * pattern as FullResetPanel: the owner's password AND a typed confirmation
 * word, checked against the database BEFORE the handoff to Electron's main
 * process - not after, since the database will not be there to check
 * against once the handoff happens.
 *
 * `requireOwnerPassword={false}` drops the password field and the
 * database round-trip that checks it, for the one place that has no
 * session to check a password against in the first place: the sign-in
 * screen, before anyone has signed in. The typed word is still required -
 * same reasoning FullResetPanel gives for RESET: it is a speed bump against
 * an accidental click, not the actual access control. The actual access
 * control there is physical access to the machine, which restoring
 * pre-login does not grant anything beyond - anyone who could click this
 * could equally well delete the data folder by hand and get the same result.
 *
 * Renders `children` instead of a button if there is no native bridge to
 * call (a plain browser dev server, not the packaged app) - that is how the
 * standalone folder-picker button keeps the written-out manual steps as a
 * fallback on the Backup page.
 */
export default function RestoreButton({
  sourcePath,
  label = 'Restore',
  compact = false,
  requireOwnerPassword = true,
  children,
}) {
  const [hasBridge, setHasBridge] = useState(false);
  useEffect(() => {
    setHasBridge(typeof window !== 'undefined' && Boolean(window.pumpManager));
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  const [state, formAction] = useActionState(confirmRestore, null);

  function beginRestore() {
    setRestoring(true);
    setRestoreError(null);
    window.pumpManager
      ?.restoreFromBackup(sourcePath)
      .then((result) => {
        // Success relaunches the whole app almost immediately - this only
        // ever actually renders if something went wrong instead (including
        // the folder picker being cancelled).
        if (!result?.ok) {
          setRestoring(false);
          setRestoreError(result?.message ?? 'Restore failed for an unknown reason.');
        }
      })
      .catch((error) => {
        setRestoring(false);
        setRestoreError(error?.message ?? String(error));
      });
  }

  // Once the password + word are confirmed against the (still-live)
  // database, hand off to the main process. There is no further
  // confirmation after this point - it starts stopping Postgres the moment
  // it is asked. Only wired up when a password is actually being checked -
  // the no-password path calls beginRestore() straight from the button.
  const handled = useRef(state);
  useEffect(() => {
    if (!requireOwnerPassword) return;
    if (state === handled.current) return;
    handled.current = state;
    if (!state?.ok) return;
    beginRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sourcePath, requireOwnerPassword]);

  if (!hasBridge) return children ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmation('');
          setRestoreError(null);
          setIsOpen(true);
        }}
        className={compact ? 'text-xs font-semibold text-red-700 hover:underline' : 'btn-danger'}
      >
        {label}
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={sourcePath ? 'Restore this backup?' : 'Restore from a backup folder?'}
        subtitle={
          <span className="text-xs text-ink-500">This replaces everything currently saved</span>
        }
      >
        <form
          action={requireOwnerPassword ? formAction : undefined}
          onSubmit={
            requireOwnerPassword
              ? undefined
              : (event) => {
                  event.preventDefault();
                  beginRestore();
                }
          }
          className="space-y-4 p-4"
        >
          <p className="text-sm text-ink-700">
            {sourcePath
              ? 'Every reading, customer, ledger entry and login currently saved is replaced with what this backup contains.'
              : 'Choose a backup folder next, then everything currently saved is replaced with what it contains.'}
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The app will restart. Sign in with the{' '}
            <span className="font-semibold">password from the backup</span>
            {requireOwnerPassword ? ', not your current one' : ''} - the logins come from the
            backup too.
          </p>

          <div>
            <label className="label" htmlFor="restore_confirmation">
              Type RESTORE to confirm
            </label>
            <input
              id="restore_confirmation"
              name="confirmation"
              type="text"
              required
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="input font-mono"
              placeholder="RESTORE"
              disabled={restoring}
            />
          </div>

          {requireOwnerPassword ? (
            <div>
              <label className="label" htmlFor="restore_password">
                Your own password
              </label>
              <input
                id="restore_password"
                name="owner_password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                disabled={restoring}
              />
            </div>
          ) : null}

          {state?.ok === false ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
            </p>
          ) : null}
          {restoreError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {restoreError}
            </p>
          ) : null}
          {restoring ? (
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Restoring - the app will restart in a moment…
            </p>
          ) : null}

          <div className="flex gap-2">
            {requireOwnerPassword ? (
              <SubmitButton
                className="btn-danger flex-1"
                pendingLabel="Checking…"
                disabled={confirmation !== 'RESTORE' || restoring}
              >
                {sourcePath ? 'Restore this backup' : 'Choose a folder and restore'}
              </SubmitButton>
            ) : (
              <button
                type="submit"
                className="btn-danger flex-1"
                disabled={confirmation !== 'RESTORE' || restoring}
              >
                {restoring ? 'Restoring…' : sourcePath ? 'Restore this backup' : 'Choose a folder and restore'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn-secondary"
              disabled={restoring}
            >
              Cancel
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
