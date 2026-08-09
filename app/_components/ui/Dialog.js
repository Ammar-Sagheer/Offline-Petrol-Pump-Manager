'use client';

import { useEffect, useRef } from 'react';

/**
 * A modal built on the native <dialog> element.
 *
 * Using the real element rather than a div: focus trapping, Escape to close,
 * inert background and the backdrop all come from the browser, already correct
 * for screen readers and keyboards. Hand-rolled modals get those wrong.
 *
 * On a phone it fills the screen as a sheet, which is the pattern people expect
 * there and avoids the cramped, floating-box feel a centred modal has on a
 * small display.
 *
 * `size="lg"` widens the desktop dialog for content that does not fit the
 * default 32rem without scrolling sideways inside it - a table, mainly. Phones
 * are unaffected either way; the sheet already fills the screen.
 *
 * Deliberately NO click-outside-to-close. Every dialog here holds a form
 * someone is part-way through typing, and a click event fires on the nearest
 * common ancestor of mousedown and mouseup - so selecting text in a field and
 * releasing the button a few pixels past the panel edge targets the <dialog>
 * itself and looked exactly like a backdrop click. That silently threw away a
 * half-entered purchase. Escape, the header X and each form's own Cancel
 * button remain, and all three are deliberate. The nav drawer in
 * AdminSidebar does still close on its backdrop: it holds no input, and
 * tap-outside-to-dismiss is what people expect of a menu.
 */
export default function Dialog({ open, onClose, title, subtitle, size = 'md', children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // showModal() is what makes the rest of the page inert.
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Fires for Escape and for close() alike, so parent state stays in step.
    const handleClose = () => onClose?.();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  // The page behind must not scroll while the sheet is open on a phone.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className={`m-0 max-h-none w-full max-w-none bg-transparent p-0
                 backdrop:bg-ink-900/50
                 sm:m-auto sm:max-h-[90dvh] ${
                   size === 'lg'
                     ? 'sm:w-[min(48rem,calc(100vw-2rem))]'
                     : 'sm:w-[min(32rem,calc(100vw-2rem))]'
                 }`}
    >
      <div
        className="flex h-dvh w-full flex-col bg-white
                   sm:h-auto sm:max-h-[90dvh] sm:rounded-xl sm:shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink-900">{title}</h2>
            {subtitle ? <div className="mt-0.5">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
