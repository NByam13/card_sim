import { ReactNode, useState } from 'react';
import { fanLayout, useMeasuredWidth } from '../fan';

/**
 * A fixed-height row of cards that overlap rather than wrapping (see `fan.ts`).
 * The card under the cursor lifts to the front so it reads fully even when
 * tucked behind its neighbour.
 *
 * That lift is scoped by `isolate`. It only ever has to beat this row's own
 * cards, and without a stacking context of its own the number would be read
 * against the whole page: a hovered Scene card was painting over the card menu
 * and the marquee box, both of which are portalled and sit far lower than 100.
 *
 * Rendering is left to the caller, so the interactive board and (later) the
 * opponent's read-only mirror share one layout while drawing their own cards.
 */
export default function FanRow<T extends { uid: string }>({
  items,
  cardWidth,
  cardHeight,
  renderItem,
}: {
  items: readonly T[];
  cardWidth: number;
  cardHeight: number;
  renderItem: (item: T) => ReactNode;
}) {
  const [measureRef, width] = useMeasuredWidth();
  const [hovered, setHovered] = useState<string | null>(null);
  const { step, startX } = fanLayout(items.length, cardWidth, width);

  return (
    <div ref={measureRef} className="relative isolate w-full" style={{ height: cardHeight }}>
      {items.map((item, index) => (
        <div
          key={item.uid}
          onMouseEnter={() => setHovered(item.uid)}
          onMouseLeave={() => setHovered((current) => (current === item.uid ? null : current))}
          className="absolute top-0 transition-[left] duration-150"
          style={{
            left: startX + index * step,
            width: cardWidth,
            zIndex: hovered === item.uid ? 100 : index,
          }}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
