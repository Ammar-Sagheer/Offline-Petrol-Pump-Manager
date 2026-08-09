/**
 * The app's icons, drawn inline rather than pulled from a package.
 *
 * WHY NOT AN ICON LIBRARY. There are seventeen icons in here. Lucide or Heroicons
 * would add a dependency and a bundle for that, and every icon in a library is
 * a decision someone else made about what a "tank" looks like. Drawing them
 * here keeps the set small, keeps them on the same 24px grid and the same
 * stroke weight, and means adding one is editing this file rather than
 * shopping.
 *
 * WHY ICONS AT ALL. The app was entirely text: ten identically-shaped nav tabs,
 * and statuses told apart by two letters and a colour. That asks the reader to
 * parse a word every time, and it leans on colour alone for the difference
 * between a nozzle that is done and one that is not - which is exactly what
 * fades in a dim pump office and what a red-green colourblind reader cannot
 * see. An icon beside the word gives a second, redundant cue: shape.
 *
 * They are decoration, never the only carrier of meaning - every icon here
 * sits next to its own label, and is aria-hidden so a screen reader is not
 * made to announce it twice. The single exception is `trash` inside an
 * IconButton, which carries its label in aria-label and title instead; the
 * reasoning is written up there.
 *
 * Everything is `currentColor` and 1.75 stroke, so an icon takes the colour and
 * the weight of the text it sits beside without being told.
 */
const PATHS = {
  // Dashboard: a roof over a room - "the whole place at a glance".
  dashboard: (
    <>
      <path d="M3 10.5 12 3.5l9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  // Readings: a dial with a needle - the pump meter.
  readings: (
    <>
      <path d="M4 18.5a8.5 8.5 0 1 1 16 0" />
      <path d="m12 14.5 3.5-3.5" />
      <circle cx="12" cy="18.5" r="1.4" />
    </>
  ),
  // Lubricants: a drop of oil.
  lubricants: <path d="M12 3.6c3.4 3.9 5.4 6.5 5.4 9a5.4 5.4 0 0 1-10.8 0c0-2.5 2-5.1 5.4-9Z" />,
  // Purchases: a delivery truck.
  purchases: (
    <>
      <path d="M3 7.5h10.5v9H3z" />
      <path d="M13.5 10.5h3.2l2.8 3.1v2.9h-6z" />
      <circle cx="7" cy="18.5" r="1.7" />
      <circle cx="16.5" cy="18.5" r="1.7" />
    </>
  ),
  // Stock: a storage tank.
  stock: (
    <>
      <path d="M4.5 7c0-1.6 3.4-2.8 7.5-2.8S19.5 5.4 19.5 7v10c0 1.6-3.4 2.8-7.5 2.8S4.5 18.6 4.5 17z" />
      <path d="M4.5 7c0 1.6 3.4 2.8 7.5 2.8S19.5 8.6 19.5 7" />
    </>
  ),
  // Customers: the people who take fuel on credit.
  customers: (
    <>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.5 5.2a3.3 3.3 0 0 1 0 6.4" />
      <path d="M17 13.6a6.2 6.2 0 0 1 4.2 5.9" />
    </>
  ),
  // Banking: the pillared front of a bank.
  banking: (
    <>
      <path d="M3 9.5 12 4.5l9 5" />
      <path d="M5.5 11v7.5M10 11v7.5M14 11v7.5M18.5 11v7.5" />
      <path d="M3 20.5h18" />
    </>
  ),
  // Expenses: a wallet - money going out.
  expenses: (
    <>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5H17v2" />
      <path d="M3.5 8.5v9a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7h-15" />
      <circle cx="16.5" cy="14" r="1.1" />
    </>
  ),
  // Reports: the month as bars.
  reports: (
    <>
      <path d="M3.5 20h17" />
      <path d="M6.5 20v-6M11 20V6.5M15.5 20v-9M20 20v-4" />
    </>
  ),
  // Settings: sliders, not a cog - a cog at 18px is mush.
  settings: (
    <>
      <path d="M4 7h8M16.5 7H20M4 12h3.5M12 12h8M4 17h8M16.5 17H20" />
      <circle cx="14.2" cy="7" r="1.8" />
      <circle cx="9.7" cy="12" r="1.8" />
      <circle cx="14.2" cy="17" r="1.8" />
    </>
  ),
  // Done. Paired with a word, never on its own.
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  // Still to do.
  pencil: (
    <>
      <path d="M4 20h4L18.5 9.5a2.05 2.05 0 0 0-2.9-2.9L5 17.2z" />
      <path d="m15 8 3 3" />
    </>
  ),
  // Trash: a bin with a lid and a handle. The one icon here that is allowed to
  // stand without a word beside it - see IconButton for why.
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.5 7v12.3A1.7 1.7 0 0 0 8.2 21h7.6a1.7 1.7 0 0 0 1.7-1.7V7" />
      <path d="M10.5 11v6" />
      <path d="M13.5 11v6" />
    </>
  ),
  // Guide: an open book.
  guide: (
    <>
      <path d="M12 6.8C10.4 5.5 8.4 4.9 5.5 4.9c-.8 0-1.5.6-1.5 1.4v10.4c0 .8.7 1.4 1.5 1.4 2.9 0 4.9.6 6.5 1.9" />
      <path d="M12 6.8c1.6-1.3 3.6-1.9 6.5-1.9.8 0 1.5.6 1.5 1.4v10.4c0 .8-.7 1.4-1.5 1.4-2.9 0-4.9.6-6.5 1.9" />
      <path d="M12 6.8V20" />
    </>
  ),
  // Activity: a clock turning back - the section is a history, not a list.
  activity: (
    <>
      <circle cx="12" cy="12.5" r="7.5" />
      <path d="M12 8.5v4l2.8 1.8" />
      <path d="M4.5 6.5v3.2h3.2" />
    </>
  ),
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  signOut: (
    <>
      <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 8.5 6 12l4 3.5" />
      <path d="M6 12h9" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" />
    </>
  ),
};

/**
 * @param {object} props
 * @param {keyof typeof PATHS} props.name
 * @param {string} [props.className] - size it with height and width utilities;
 *   colour is inherited from the surrounding text.
 */
export default function Icon({ name, className = 'h-5 w-5' }) {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}
