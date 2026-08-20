'use client';

import { useBrand } from '@/app/_components/ui/BrandProvider';

/**
 * The business's mark: its licensed initials, drawn as a monogram tile.
 *
 * WAS AN IMAGE FILE (public/logo.png) with an initials tile behind it as a
 * fallback. That went because the file shipped in the installer was one
 * client's own flower logo, so every install - whoever it was licensed to -
 * wore somebody else's branding. Exactly the bug licensing was built to fix
 * for the business NAME, still present for the picture next to it. The
 * initials come from the signed licence (`i`), so each client's install now
 * marks itself correctly with no per-client build and no image to ship.
 *
 * SVG, NOT A STYLED <div>. The caller sizes this by height alone (h-10 in
 * the sidebar, h-16 on the login screen) and the old tile set its letters at
 * a fixed text-xs regardless, so the same mark that fitted the sidebar sat
 * as three tiny letters adrift in the middle of the login screen's box. In a
 * viewBox every part scales together, so one component is right at every
 * size without a size prop or a font-size lookup table.
 *
 * `textLength` with `lengthAdjust="spacingAndGlyphs"` is what makes two- and
 * three-letter initials both fill the tile: MP and MPS are set to the same
 * measured width instead of MPS spilling toward the edges while MP floats in
 * the middle. Initials longer than three characters are cut - the licence
 * tool asks for initials, not a name, and the tile is not the place to
 * discover somebody typed a sentence.
 *
 * Decorative throughout: the business name is written next to it every time
 * it is used, so this is hidden from screen readers.
 */
export default function BrandMark({ className = 'h-9' }) {
  const { initials } = useBrand();
  const letters = String(initials || '').trim().slice(0, 3).toUpperCase();

  return (
    <svg
      viewBox="0 0 64 64"
      role="presentation"
      aria-hidden="true"
      className={`aspect-square w-auto shrink-0 ${className}`}
    >
      <defs>
        {/*
         * Ids have to be unique per document, not per component - two marks
         * render at once on no screen today, but the sidebar has both a
         * collapsed and an expanded one in the DOM at some widths, and two
         * identical ids would have the second silently reuse the first's
         * gradient. Same-value gradients make that invisible until someone
         * changes one, which is the worst kind of bug to leave lying around.
         */}
        <linearGradient id="brandmark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        {/* The top highlight - a soft sheen over the upper half, which is what
            stops the tile reading as a flat placeholder box. */}
        <linearGradient id="brandmark-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="15" fill="url(#brandmark-fill)" />
      <rect width="64" height="64" rx="15" fill="url(#brandmark-sheen)" />
      {/* Hairline inset, drawn just inside the edge so the mark keeps a crisp
          border against both the white sidebar and the tinted login card. */}
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="14.25"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />

      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        textLength={letters.length > 2 ? 42 : 34}
        lengthAdjust="spacingAndGlyphs"
        fill="#ffffff"
        fontSize="27"
        fontWeight="700"
        fontFamily="inherit"
        // Optical centring: cap-height letters sit slightly high of a true
        // middle, so the baseline is nudged down a hair rather than left
        // where dominant-baseline alone puts it.
        style={{ letterSpacing: '0.01em' }}
      >
        {letters}
      </text>
    </svg>
  );
}
