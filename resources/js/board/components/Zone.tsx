import { useDroppable } from '@dnd-kit/core';
import { CSSProperties, ReactNode } from 'react';
import { useBoardZoom } from '../context';
import { CardInstance, ZoneId } from '../types';
import BoardCard from './BoardCard';
import { BASE_WIDTH } from './CardFace';
import FanRow from './FanRow';

/**
 * A labelled drop bucket, in whichever of the board's layout modes it needs.
 *
 * Ported from PonyRec's `Zone.tsx`. The modes are generic and stay; the one MLP
 * rule inside — that a Main Character stands centred on top of a Story stage —
 * is the "who stands on top" decision the audit expects to move out to the
 * setup module later.
 */

/**
 * How much a following card is tucked under the card to its left in an
 * overlapped zone — a character (first) with an item adorned onto it (second)
 * share an Adventure lane, and the item peeks out from behind the character's
 * right edge.
 */
export const OVERLAP_FRACTION = 0.45;

export default function Zone({
  id,
  label,
  cards,
  count,
  centered = false,
  smallHeader = false,
  countOverlay = false,
  stack = false,
  stackHeight,
  overlap = false,
  fan = false,
  bare = false,
  fill = false,
  headerAction,
  className = '',
  style,
}: {
  id: ZoneId;
  label: string;
  cards: CardInstance[];
  count?: number;
  /** Centre the cards within the zone (Hand). */
  centered?: boolean;
  /** Smaller header text (bottom-bar piles). */
  smallHeader?: boolean;
  /** Show the count as a corner badge instead of inline in the label. */
  countOverlay?: boolean;
  /** Overlap cards in a fixed-height area (Story stages) instead of flowing them. */
  stack?: boolean;
  /** Height (px) of the stack area; required when `stack` is set. */
  stackHeight?: number;
  /**
   * Tuck each card partly under the one to its left (Adventure lanes): a
   * character and the item adorned onto it share a lane, character on top.
   */
  overlap?: boolean;
  /**
   * Lay the cards out as a fan (Scene Zone): one fixed-height row that slides
   * cards under each other once they stop fitting, rather than wrapping onto a
   * second line. A Scene Deck runs to 15 cards, and on a two-player table a
   * second row of them costs height the board cannot spare.
   */
  fan?: boolean;
  /** No header, border or padding — a chrome-less droppable (a Plan over a Story card). */
  bare?: boolean;
  /** Grow the card area to fill the zone and centre both ways (Main Character). */
  fill?: boolean;
  /** Optional control rendered in the zone header (a ZoneMenu chevron). */
  headerAction?: ReactNode;
  className?: string;
  /** Inline styles — e.g. zoom-driven minimum dimensions on Adventure lanes. */
  style?: CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const scale = useBoardZoom();

  if (bare) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-wrap gap-1 rounded-md transition-colors ${
          isOver ? 'bg-emerald-100/60 ring-1 ring-emerald-400' : ''
        } ${centered ? 'justify-center' : ''} ${className}`}
      >
        {cards.map((c) => (
          <BoardCard key={c.uid} instance={c} zone={id} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      // p-1 rather than p-2, and the label floats out of the flow as a corner
      // badge instead of taking a stacked header row. On a two-player table
      // that chrome is paid by ~7 vertically stacked zones, so the ~34px each
      // saving is the single biggest lever on total board height.
      className={`relative rounded-lg border p-1 transition-colors ${
        fill || overlap ? 'flex flex-col' : ''
      } ${isOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-gray-200'} ${className}`}
    >
      <div
        // No z-index on purpose. The label is chrome and sits in the band just
        // above the content box — exactly where a card's harmony-cost badge
        // (-top-1.5) pokes out. Leaving it at auto means the cards, which come
        // later in DOM order, paint over it instead of being clipped by it.
        // headerAction keeps its z-20 because it must stay clickable.
        className={`pointer-events-none absolute -top-2 left-2 flex items-center gap-1 rounded bg-white px-1 font-semibold tracking-wide text-gray-400 uppercase ${
          smallHeader ? 'text-[8px]' : 'text-[9px]'
        }`}
      >
        <span>
          {label}
          {count !== undefined && !countOverlay && <span className="tabular-nums"> ({count})</span>}
        </span>
      </div>

      {/*
        The header action stays interactive, so it sits in its own corner rather
        than inside the pointer-events-none label badge.
      */}
      {headerAction && <div className="absolute -top-2 right-1 z-20">{headerAction}</div>}

      {stack ? (
        // Overlapping stack: the Story card sits at the bottom, the Plan overlay
        // (a sibling zone, z-10) covers its top half, and the Main Character —
        // portrait, lifted above the Plan — stands centred on top.
        <div className="relative" style={{ height: stackHeight }}>
          {cards.map((c, idx) => {
            const isMainChar = c.card.subtype === 'main-character';
            return (
              <div
                key={c.uid}
                className={`absolute left-1/2 -translate-x-1/2 ${
                  isMainChar ? 'top-1/2 -translate-y-1/2' : 'bottom-0'
                }`}
                style={{ zIndex: isMainChar ? 20 : idx }}
              >
                <BoardCard instance={c} zone={id} />
              </div>
            );
          })}
        </div>
      ) : overlap ? (
        // Overlapping row: the character (first) sits on top, each following
        // card (an adorned item) tucked under its left neighbour so only its
        // right edge shows. Centred in the lane, which reserves more room than
        // one card needs; the negative tuck margins still work under
        // `justify-center` because the row centres as one group.
        <div className="flex flex-1 items-center justify-center">
          {cards.map((c, idx) => (
            <div
              key={c.uid}
              className="relative"
              style={{
                marginLeft: idx === 0 ? 0 : -BASE_WIDTH * scale * OVERLAP_FRACTION,
                zIndex: cards.length - idx,
              }}
            >
              <BoardCard instance={c} zone={id} />
            </div>
          ))}
        </div>
      ) : fan ? (
        <FanRow
          items={cards}
          cardWidth={BASE_WIDTH * scale}
          cardHeight={(BASE_WIDTH * scale * 88) / 63}
          renderItem={(c) => <BoardCard instance={c} zone={id} />}
        />
      ) : (
        <div
          className={`flex flex-wrap gap-1 ${centered || fill ? 'justify-center' : ''} ${
            fill ? 'flex-1 items-center' : ''
          }`}
        >
          {cards.map((c) => (
            <BoardCard key={c.uid} instance={c} zone={id} />
          ))}
        </div>
      )}

      {countOverlay && count !== undefined && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-1.5 text-[10px] leading-tight font-bold text-white tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}
