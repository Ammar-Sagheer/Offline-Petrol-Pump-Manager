import Icon from '@/app/_components/ui/Icon';
import Sparkline from '@/app/_components/ui/Sparkline';
import DeltaBadge from '@/app/_components/ui/DeltaBadge';

/**
 * What colour an icon ring wears, keyed by the icon's own name.
 *
 * FOUR COLOURS, AND EACH ONE MEANS SOMETHING. Green is money arriving,
 * amber is money owed or gone, red is something to look at, slate is
 * everything else. That is the whole vocabulary.
 *
 * It used to be seven hues - sky, cyan, violet, teal, indigo on top of these -
 * one per KIND of thing rather than per meaning: fuel blue, oil violet, stock
 * teal, banking indigo. It read as a rainbow rather than a palette, and the
 * colours were carrying nothing the icon and the label did not already say.
 * Worse, two of those hues were the fuels' own: a blue ring on "Litres sold"
 * and a violet one on "Oil sold" are exactly the colours petrol and lubricant
 * wear as identity elsewhere, so the ring quietly competed with the one cue
 * that has to stay unmistakable.
 *
 * The rule now: **colour a ring only when the colour adds meaning the icon
 * cannot.** A wallet icon already says "expenses"; the amber says "and this is
 * money leaving". A pump icon already says "fuel"; there is nothing left for a
 * colour to add, so it stays slate.
 *
 * `tone` remains a separate axis and still colours the figure itself and its
 * pill, so a bad month's profit is a red number in a green ring: the ring says
 * "this tile is about money coming in", the number says "and it went the wrong
 * way".
 *
 * NOT A FILLED RING ANY MORE - a small glyph beside the label, in the hue.
 * The Ramtabs reference the owner supplied sets its tiles that way: a quiet
 * outline icon sharing the label's line, with the card's colour spent on the
 * sparkline instead. It is the better trade for this app, and it also settled
 * a question the Argon pass had got stuck on.
 *
 * WHAT THE FILLED VERSION COST. Argon's rings are solid saturated circles.
 * That works for three of these four meanings and breaks on the fourth: money
 * owed is amber, and a saturated amber IS diesel. Measured rather than
 * eyeballed, `amber-600` is `#d97706` at hue 33 degrees, against diesel's own
 * swatch `#FB923C` at 27 and its accent rule `#C2410C` at 17. Six degrees is
 * not a distinction. Rendered, the "On credit" ring landed one section above a
 * diesel-accented card and was the loudest thing on a page where orange is
 * supposed to mean one specific fuel - exactly what docs/UI_CONVENTIONS.md ->
 * "Two palettes, and they never overlap" exists to prevent, and a safety rule
 * rather than a taste one. There is no step that is both solid and not orange;
 * `amber-700` is 25 degrees, nearer still.
 *
 * WHERE THE LINE ACTUALLY FALLS: AREA, NOT SIZE. A 16px outline glyph spends
 * so little of the hue that the question goes away - it is a stroke, and the
 * label beside it says "On credit" in words. A sparkline is not: 72x34px of
 * line plus fill is MORE amber than the 44px circle that was rejected, and
 * rendered directly above a diesel-accented card the two read as one colour
 * language. So the two get different maps.
 *
 * SPARK_COLORS may only be green, red or slate - the chrome colours no fuel
 * owns. Amber is the single chrome colour a fuel does own, so the money-owed
 * group draws its sparkline in neutral slate and keeps its amber on the glyph.
 * The tile does not lose the meaning; it stops shouting it in diesel's voice.
 */
const ACCENT_COLORS = {
  // Money arriving.
  cash: 'text-brand-600',
  moneyIn: 'text-brand-600',
  profit: 'text-brand-600',
  sales: 'text-brand-600',
  // Money owed, or already gone.
  credit: 'text-amber-600',
  moneyOut: 'text-amber-600',
  expenses: 'text-amber-600',
  purchases: 'text-amber-600',
  list: 'text-amber-600',
  // Something to look at.
  warning: 'text-red-600',
  // Things the pump HOLDS - fuel in a tank, oil on a shelf, kit in the yard.
  fuelPump: 'text-teal-600',
  stock: 'text-teal-600',
  inventory: 'text-teal-600',
  lubricants: 'text-teal-600',
  assets: 'text-teal-600',
  // The record-keeping: what was read, what was banked, which day.
  readings: 'text-violet-600',
  banking: 'text-violet-600',
  date: 'text-violet-600',
  // The people behind the credit.
  customers: 'text-violet-600',
  account: 'text-violet-600',
};

const ACCENT_FALLBACK = 'text-ink-500';

/* The same keys, but amber is deliberately absent - see above. */
const SPARK_COLORS = {
  cash: 'text-brand-600',
  moneyIn: 'text-brand-600',
  profit: 'text-brand-600',
  sales: 'text-brand-600',
  credit: 'text-ink-400',
  moneyOut: 'text-ink-400',
  expenses: 'text-ink-400',
  purchases: 'text-ink-400',
  list: 'text-ink-400',
  warning: 'text-red-600',
};

const SPARK_FALLBACK = 'text-ink-400';

/**
 * The headline figures at the top of a page.
 *
 * These are stat tiles rather than a chart on purpose: four single numbers with
 * no trend to show are read faster as text than as any plot.
 *
 * They stay WHITE. A dark slate strip was tried here to make the takings lead
 * the page - they are the first figure wanted each morning, and were the palest
 * thing on it - and the owner's verdict was that it looked bad. It did: a black
 * bar across the top of an otherwise light page reads as a toolbar or an error
 * state, not as a headline. Hierarchy on this page comes from the section order
 * and the size of the figures instead.
 *
 * Each tile is its OWN raised card, not a cell in a shared grid. Individually
 * shadowed, gapped tiles read as separate figures to check off one at a time -
 * a single slab with hairline dividers read as one fused block, which is the
 * opposite of "four things to verify against the drawer". `sub` renders as a
 * small pill rather than plain text when the tile has a direction (`tone`
 * `positive`/`negative`) - the same information, just legible at a glance the
 * way a coloured tag is and a sentence is not.
 *
 * `icon` is optional and puts a small glyph beside the label, in the hue its
 * meaning carries (see ACCENT_COLORS). Left off, the tile is the same tile
 * without it; not every stat has an icon that means anything, so this is
 * opt-in. `accentTone` overrides the colour for a tile whose icon means
 * something different in context.
 *
 * `spark` is an optional array of numbers - the same figure over the last N
 * days - drawn as a sparkline to the right of the value. `sparkTips` is the
 * matching array of `{ v, d }` readouts, pre-formatted by the caller (see
 * Sparkline.js on why the formatting cannot happen in there), which is what
 * turns the line into something hoverable.
 *
 * `delta` is `{ current, previous, from, higherIsBetter }` and renders the
 * percent badge - see DeltaBadge.js, and note `higherIsBetter: false` on
 * anything where a rise is bad news. It sits ABOVE `sub`: the comparison is a
 * fact about the figure, `sub` is a description of it. It is DECORATION
 * WITH A SHAPE, not a second figure: no axis, no scale, no tooltip, and
 * aria-hidden, so nothing on it can be misread as a quantity. Pass it only
 * where a real series already exists; a tile with none simply has none, and
 * that is not a broken-looking tile.
 *
 * `iconNode` is the escape hatch for a one-off icon that isn't in the app's
 * own hand-drawn set (`Icon.js`) - currently only the Customers "Total
 * outstanding" tile, which uses a Material UI icon at the owner's request.
 * Pass a rendered node (already sized) instead of a name; `icon` is ignored
 * when this is set. Reach for `icon` first - this exists so one page can
 * differ without teaching the whole set about a package the rest of the app
 * does not use.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  iconNode,
  spark,
  sparkTips,
  delta,
  accentTone,
}) {
  const valueTone =
    tone === 'positive' ? 'text-brand-700' : tone === 'negative' ? 'text-red-700' : 'text-ink-900';

  const pillClass =
    tone === 'positive'
      ? 'bg-brand-50 text-brand-700'
      : tone === 'negative'
        ? 'bg-red-50 text-red-700'
        : 'bg-ink-100 text-ink-600';

  /*
   * A PILL ONLY WHEN IT HAS A DIRECTION; PLAIN TEXT OTHERWISE.
   *
   * This is what the component was documented as doing and not what it did -
   * every `sub` was a pill regardless of `tone`. It did not matter until the
   * percent badge arrived, and then it did: two chips of almost the same size
   * stacked one above the other, which the owner's word for was "cluttered".
   * They are not the same kind of thing. The badge is a MEASUREMENT and earns
   * a chip; `sub` is a DESCRIPTION ("Rs 795,698 fuel · Rs 2,400 lubricants")
   * and reads better as a line of text under one.
   *
   * A toned `sub` keeps its pill, because there the colour and the arrow are
   * carrying meaning that plain grey text would lose.
   */
  const subIsPill = tone === 'positive' || tone === 'negative';

  const sub_ = sub ? (
    subIsPill ? (
    <span
      className={`tabular inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass}`}
    >
      {tone === 'positive' ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <path d="M6 2 10 8H2Z" fill="currentColor" />
        </svg>
      ) : tone === 'negative' ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <path d="M6 10 2 4h8Z" fill="currentColor" />
        </svg>
      ) : null}
      {sub}
    </span>
    ) : (
      <span className="tabular block text-xs font-medium leading-relaxed text-ink-500">{sub}</span>
    )
  ) : null;

  if (icon || iconNode || spark) {
    const accentClass = accentTone ?? ACCENT_COLORS[icon] ?? ACCENT_FALLBACK;

    /* Direction wins over category when the tile has one: a negative tone
       means the figure itself is already red, and a green line under a red
       number would be two cues disagreeing. */
    const sparkClass =
      tone === 'negative'
        ? 'text-red-600'
        : tone === 'positive'
          ? 'text-brand-600'
          : (SPARK_COLORS[icon] ?? SPARK_FALLBACK);

    /*
     * THE FIGURE KEEPS THE LEFT EDGE AND ITS OWN LINE; THE SPARKLINE TAKES
     * WHAT IS LEFT, AND GIVES IT BACK WHEN THERE IS NOT ENOUGH.
     *
     * The reference puts label, figure and comparison in a column with a small
     * chart beside the figure, and the arrangement is the point - but it is
     * drawn against `$1,842,400` in a wide tile. Ours is `Rs 1,204,950` set
     * bold at 24px, in a tile about 265px wide once four share a laptop grid
     * with the 240px sidebar taken off the window first. That number needs
     * ~190px on its own and `whitespace-nowrap` is not negotiable (a money
     * figure breaking after the "Rs" reads for a moment as two figures), so
     * there is not always room for both.
     *
     * SO THE SPARKLINE YIELDS THE LINE, NOT THE PAGE. It used to be `hidden`
     * below the threshold entirely, and the owner reported the obvious
     * consequence: "the graphs disappear when screen size reduced". They did -
     * on a 1360px window the sidebar takes 240px and the grid never reaches
     * the threshold, so the charts were missing on the screen the app is
     * actually used on.
     *
     * Yielding the ROW is enough. The row wraps, so when the figure and the
     * chart cannot share a line the chart takes its own underneath at full
     * width - which is a better chart anyway, four times as wide as the 72px
     * it gets when squeezed in beside. The rule the old code was serving
     * ("decoration must never be the reason a figure cannot be read") is
     * untouched: the figure still owns its line and never shrinks. What
     * changed is that the alternative to competing is now moving, not
     * vanishing.
     */
    return (
      <div className="card flex flex-col gap-2 px-4 py-4 @[62rem]:px-5 @[62rem]:py-5">
        <div className={`flex items-center gap-2 ${accentClass}`}>
          {/* 20px, not 16. At 16 it read as a bullet point rather than a
              picture of the thing - the owner's word was "too small" - and it
              was undersized against a 12px uppercase label to begin with. This
              is the shared tile, so the size lands on every page that has a
              stat row. */}
          {iconNode ?? (icon ? <Icon name={icon} className="h-5 w-5 shrink-0" /> : null)}
          <p className="figure-label">{label}</p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <p
            className={`tabular whitespace-nowrap text-xl font-bold @[62rem]:text-2xl ${valueTone}`}
          >
            {value}
          </p>
          {spark ? (
            <span
              className={`block w-full @[68rem]:w-auto @[68rem]:max-w-[72px] @[68rem]:flex-1 ${sparkClass}`}
            >
              <Sparkline data={spark} tips={sparkTips} className="h-8 w-full @[68rem]:h-[34px]" />
            </span>
          ) : null}
        </div>

        {delta ? <DeltaBadge {...delta} /> : null}

        {/* `sub` spans the full card width rather than being squeezed beside
            anything. A long description ("sales - stock bought - expenses")
            wrapped to three cramped lines in a narrower column. */}
        {sub_}
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-2 px-4 py-4 @[62rem]:px-5 @[62rem]:py-5">
      <p className="figure-label">{label}</p>
      {/* nowrap, and a step smaller on a phone. "Rs 4,386,211" in a
          half-width tile was breaking after the "Rs", which reads for a moment
          as two separate figures - the one thing a money tile must never do. */}
      <p className={`tabular whitespace-nowrap text-xl font-bold @[62rem]:text-2xl ${valueTone}`}>
        {value}
      </p>
      {delta ? <DeltaBadge {...delta} /> : null}
      {sub_}
    </div>
  );
}

export function StatGrid({ children, columns = 4 }) {
  const columnClass =
    columns === 2 ? '' : columns === 3 ? '@[50rem]:grid-cols-3' : '@[54rem]:grid-cols-4';

  /*
   * The column count follows the WIDTH OF THIS GRID, not the width of the
   * window - hence @container and the @[..] variants rather than sm: and lg:.
   *
   * Those are not the same number any more. The sidebar takes 240px off the
   * left, so at a 1024px window this grid has about 768px to work in. Asked
   * for four columns at the `lg` viewport breakpoint it gave each tile 192px,
   * and "Rs 4,386,211" at 24px needs more than that - the figures ran into
   * their own dividers. Measured against the grid itself, four columns wait
   * until there is genuinely room for them.
   *
   * The bottom end is the same problem from the other side: two tiles across
   * a 320px phone leaves about 130px each, where the number either broke
   * after the "Rs" - two lines that read for a moment as two figures - or ran
   * out of its tile. One per row until 32rem.
   *
   * 32rem, not the 24rem it was. At a 392px grid two columns give each tile
   * 188px, and `Rs 14,386,211` - an eight-figure month, which Expenses and
   * Purchases do reach - needs about 200px even at the phone's smaller step.
   * It ran out through the card's right edge. Measured by walking every width
   * from 340px to 1600px and comparing each figure's box against its card's
   * PADDING box, which is the check that catches this; a plain
   * scrollWidth/clientWidth test does not, because the figure overflows its
   * card without overflowing itself.
   */
  return (
    <div className="@container">
      <div className={`grid grid-cols-1 gap-4 @[32rem]:grid-cols-2 ${columnClass}`}>{children}</div>
    </div>
  );
}
