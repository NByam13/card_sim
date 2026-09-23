/**
 * The "N cards selected" chip.
 *
 * A marquee selection changes what every card key does, so it cannot be a state
 * you have to notice by spotting rings on cards that may be scrolled off or
 * tucked behind their neighbours. The chip is the one unmissable signal that the
 * keyboard is aimed at a group, and it carries the way out.
 *
 * Positioned absolutely against the arena's own game zone rather than fixed to
 * the viewport, so it holds the top-left corner of the board it belongs to. That
 * is the difference that matters in a two-player game: the opponent's board sits
 * above yours and both boards carry their own zoom, so any viewport-anchored
 * spot drifts across the table as either one is scaled. A child of the game zone
 * moves with it. The corner it takes is the emptiest part of the board, above
 * the Main Character rail and left of Lane 1.
 *
 * Rendered by the board rather than the arena for the same reason: the arena is
 * a sibling of the game zone and could only guess at where its corner is.
 */
export default function SelectionChip({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;

  return (
    <div
      // Not pointer-events-none: the Clear button is the point. Marked
      // data-no-marquee so a press on the chip never paints a box behind it.
      data-no-marquee
      className="absolute top-2 left-2 z-40 flex items-center gap-2 rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-black/10"
    >
      <span aria-live="polite" className="tabular-nums">
        {count} card{count === 1 ? '' : 's'} selected
      </span>
      <button
        onClick={onClear}
        className="rounded-full bg-white/20 px-2 py-0.5 font-semibold transition hover:bg-white/30"
      >
        Clear
      </button>
    </div>
  );
}
