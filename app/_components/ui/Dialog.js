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
                 backdrop:bg-ink-900/60 backdrop:backdrop-blur-sm
                 sm:m-auto sm:max-h-[90dvh] ${
                   size === 'lg'
                     ? 'sm:w-[min(48rem,calc(100vw-2rem))]'
                     : 'sm:w-[min(32rem,calc(100vw-2rem))]'
                 }`}
    >
      {/*
       * `whitespace-normal text-left` IS A RESET, AND IT IS LOAD-BEARING.
       *
       * A <dialog> opened with showModal() is painted in the browser's top
       * layer, so nothing about where it sits in the DOM constrains its
       * position or its size - which is easy to read as "nothing about where
       * it sits affects it at all". Inherited properties still come down the
       * DOM ancestry as usual, and a delete-confirmation dialog rendered from
       * inside a right-aligned, non-wrapping money cell (a `.td-num`) inherits
       * both: its explaining sentence renders right-aligned and, unable to
       * wrap, runs off the side of the panel and puts a horizontal scrollbar
       * inside the dialog - so the sentence saying what deleting would do is
       * half off screen.
       *
       * Fixed here rather than at each call site, because it is the panel
       * that is wrong: a modal's own typography should not depend on which
       * cell opened it.
       */}
      <div
        className="flex h-dvh w-full flex-col whitespace-normal bg-white text-left
                   sm:h-auto sm:max-h-[90dvh] sm:rounded-xl sm:shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink-900">{title}</h2>
            {subtitle ? <div className="mt-0.5">{subtitle}</div> : null}
          </div>
          {/*
           * A REAL BUTTON, NOT A GLYPH FLOATING IN THE CORNER. It was a bare
           * ✕ in `ink-500` with no edge until hover, which on a white header
           * reads as decoration rather than a control - and this dialog is the
           * only way out of the entry task, so the way out has to look like
           * one.
           *
           * It is also a TARGET. At 44px square it clears the tap-target floor
           * this app holds everywhere else; the old one was about 28px, which
           * on a tablet held one-handed at the pump is a miss waiting to
           * happen - and a miss here lands on the backdrop, which does nothing
           * (see the note above about click-outside), so the reader taps twice
           * and wonders why.
           *
           * `hover:text-red-700` and not a red default: leaving is not a
           * destructive act, so the button should not sit there coloured like
           * one. The red is a response to being aimed at.
           */}
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink-200
                       bg-ink-50 text-xl leading-none text-ink-600 transition
                       hover:border-red-200 hover:bg-red-50 hover:text-red-700
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
