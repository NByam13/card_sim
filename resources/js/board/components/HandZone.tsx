import { useDroppable } from '@dnd-kit/core';
import { RefObject, useCallback, useState } from 'react';
import { useBoardZoom } from '../context';
import { FAN_GAP, fanLayout, useMeasuredWidth } from '../fan';
import { CardInstance } from '../types';
import BoardCard from './BoardCard';
import { BASE_WIDTH } from './CardFace';

/**
 * The Hand — a single, fixed-height row that never grows vertically. Cards lay
 * out left→right and, once they no longer fit side by side, fan out overlapping
 * each other (like a hand held in real life) so the row width is capped. The
 * card being hovered lifts to the front so it reads fully even when overlapped.
 * The layout itself lives in `fan.ts`, shared with the Scene Zone.
 *
 * `cardsRef` is attached to the inner card area so the board can measure each
 * card's on-screen position and turn a drop's pointer-x into an insertion index
 * (drops keep their left/middle/right position instead of always appending).
 */
export default function HandZone({
  cards,
  cardsRef,
  dropIndex,
}: {
  cards: CardInstance[];
  cardsRef: RefObject<HTMLDivElement | null>;
  /** Live insertion slot while a card hovers the hand, or null. Drives the marker. */
  dropIndex: number | null;
}) {
  const scale = useBoardZoom();
  const { setNodeRef, isOver } = useDroppable({ id: 'hand' });
  const [measureRef, width] = useMeasuredWidth();
  const [hovered, setHovered] = useState<string | null>(null);

  const cardWidth = BASE_WIDTH * scale;
  const cardHeight = (cardWidth * 88) / 63;
  const n = cards.length;
  const { step, usedWidth, startX } = fanLayout(n, cardWidth, width);

  // Memoised, so React attaches it once instead of detaching and reattaching on
  // every render. `useMeasuredWidth` tolerates a churning ref now, so this is
  // belt and braces rather than the fix, but the churn is pure waste: it drags
  // dnd-kit's droppable registration through the same needless cycle.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      measureRef(node);
    },
    [setNodeRef, measureRef]
  );

  return (
    <div
      ref={setRefs}
      className={`relative flex-1 rounded-lg border p-1 transition-colors ${
        isOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-gray-200'
      }`}
    >
      {/* Unset z-index so hand cards' cost badges aren't clipped — see Zone. */}
      <div className="pointer-events-none absolute -top-2 left-2 rounded bg-gray-100 px-1 text-[9px] font-semibold tracking-wide text-gray-400 uppercase">
        Hand <span className="tabular-nums">({n})</span>
      </div>

      {/*
        isolate, so the hovered card's lift is read against its neighbours here
        rather than against the page — see FanRow, which fans the same way.
      */}
      <div ref={cardsRef} className="relative isolate" style={{ height: cardHeight }}>
        {cards.map((c, i) => {
          const left = startX + i * step;
          const isHovered = hovered === c.uid;
          return (
            <div
              key={c.uid}
              data-hand-slot={c.uid}
              onMouseEnter={() => setHovered(c.uid)}
              onMouseLeave={() => setHovered((h) => (h === c.uid ? null : h))}
              className="absolute top-0 transition-[left] duration-150"
              style={{ left, width: cardWidth, zIndex: isHovered ? 100 : i }}
            >
              <BoardCard instance={c} zone="hand" />
            </div>
          );
        })}

        {/* Insertion marker — a thin rule at the slot the dragged card will land in. */}
        {dropIndex !== null && (
          <div
            className="pointer-events-none absolute top-0 z-110 w-0.5 rounded bg-emerald-500"
            style={{
              height: cardHeight,
              left: Math.min(startX + dropIndex * step - FAN_GAP / 2, startX + usedWidth),
            }}
          />
        )}
      </div>
    </div>
  );
}
