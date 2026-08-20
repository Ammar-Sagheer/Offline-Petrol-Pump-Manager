'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import FormMessage from '@/app/_components/ui/FormMessage';

/**
 * Renewing a licence without leaving the app - see docs/LICENSING_WORKFLOW.md,
 * "Renewing from inside the app".
 *
 * The point of this existing at all: before it, the only way to activate a
 * new token was the pre-launch window in electron/licence-window.js, which
 * means quitting and reopening. A licence that lapses mid-shift is a bad
 * moment to close the app on someone with a half-typed reading in front of
 * them. Nothing here touches the session cookie, the Next child process or
 * the window - it writes licence.json through the preload bridge and calls
 * router.refresh(), and the red banner is gone on the next render because
 * isRestricted() (app/_lib/licence.js) re-reads that file every call.
 *
 * Not a Server Action, deliberately: the token has to be verified against
 * this machine's fingerprint, which only the main process can read, and
 * duplicating signature verification on the Next side to avoid one IPC call
 * would mean two code paths that can disagree about what a valid licence is.
 */

/**
 * A browser-side mirror of extractToken() in electron/licence.js - see that
 * function for why the filtering is line-by-line rather than a whitespace
 * strip. It exists twice because the renderer cannot require() a
 * main-process module, and the box needs to show the cleaned token the
 * moment a file is picked rather than after a round trip. The copy in main
 * is the authority: it runs on whatever this sends regardless, so a
 * disagreement between the two is cosmetic, never a wrong activation.
 */
function extractToken(rawText) {
  return String(rawText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /^[A-Za-z0-9_.-]+$/.test(line))
    .join('');
}

export default function RenewLicenceDialog({ open, onClose }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [token, setToken] = useState('');
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(null);
  const [pending, setPending] = useState(false);
  const [renewed, setRenewed] = useState(false);

  // The installation code is worth showing here even though renewal does not
  // strictly need it: the first thing the installer asks for is that code,
  // and the alternative for a client whose app is already running was to
  // reinstall to see the activation screen again.
  useEffect(() => {
    if (!open || !window.pumpManager?.licenceInfo) return;
    window.pumpManager.licenceInfo().then(setInfo).catch(() => setInfo(null));
  }, [open]);

  async function handleActivate() {
    // A browser tab on `npm run dev` has no preload and therefore no bridge.
    // Saying so beats an undefined-is-not-a-function in the console.
    if (!window.pumpManager?.renewLicence) {
      setState({ ok: false, message: 'Renewing only works in the installed app, not a browser.' });
      return;
    }

    setPending(true);
    setState(null);
    const result = await window.pumpManager.renewLicence(token);
    setPending(false);

    if (!result.ok) {
      setState(result);
      return;
    }

    setState({
      ok: true,
      message: result.supportUntil
        ? `Licence renewed - covered until ${result.supportUntil}. You can close this and carry on; nobody has been signed out.`
        : 'Licence renewed. You can close this and carry on; nobody has been signed out.',
    });
    setToken('');
    setRenewed(true);
  }

  /**
   * The refresh is held until the dialog is dismissed, and that ordering is
   * not cosmetic. router.refresh() re-renders the admin layout, which is what
   * drops the red banner - but this dialog is rendered BY that banner, so
   * refreshing at the moment of success unmounts the very box showing the
   * "renewed" line, and the client sees their confirmation flash and vanish.
   * Nothing waits on the refresh anyway: requireRole() reads licence.json per
   * call, so data entry is already working again the instant the token is
   * written. Only the banner's pixels are behind, and they clear as the
   * dialog closes.
   */
  function handleClose() {
    onClose?.();
    if (renewed) router.refresh();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setToken(extractToken(await file.text()));
    setState(null);
    // Same file picked twice in a row still fires change without this.
    event.target.value = '';
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Renew your licence">
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-sm text-ink-700">
          Send your installer the installation code below. They will send back a short text file -
          paste it here, or use <b>Load from file</b>, and press Renew.
        </p>

        {info?.code ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Installation code
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-800">
                {info.code}
              </code>
              <Button onClick={() => navigator.clipboard?.writeText(info.code)}>Copy</Button>
            </div>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="licence-token"
            className="text-xs font-semibold uppercase tracking-wide text-ink-500"
          >
            Licence
          </label>
          <textarea
            id="licence-token"
            rows={5}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste the licence your installer sent"
            spellCheck={false}
            className="mt-1 w-full break-all rounded-lg border border-ink-200 px-3 py-2 font-mono text-xs text-ink-800
                       focus:border-brand-500 focus:outline-none"
          />
        </div>

        <FormMessage state={state} />

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Hidden input rather than a native open dialog through IPC: the
              renderer can already read a picked file itself, and the
              activation window does exactly this for the same reason. */}
          <input
            ref={fileRef}
            type="file"
            accept=".txt"
            onChange={handleFile}
            className="hidden"
          />
          <Button onClick={() => fileRef.current?.click()}>Load from file</Button>
          <Button variant="primary" onClick={handleActivate} disabled={!token.trim() || pending}>
            {pending ? 'Checking...' : 'Renew'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
