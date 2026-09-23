import { useDraggable } from '@dnd-kit/core';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useBoardCardBacks,
  useBoardDispatch,
  useBoardFocus,
  useBoardGroupDrag,
  useBoardZoom,
} from '../context';
import { SELECTABLE_ATTR } from '../selection';
import { CardInstance, rendersLandscape, ZoneId } from '../types';
import CardFace, { backIsLandscape, BASE_WIDTH, BASE_WIDTH_LANDSCAPE, cardBack } from './CardFace';

/**
 * One card in play: what you drag, tap, turn over and open a menu on.
 *
 * Ported from PonyRec's `PlaytestCard.tsx`, minus the theming (the accent colour
 * there follows the deck's Main Character, which is a PonyRec feature, so hover
 * uses a fixed hue here) and minus the card-detail modal it could open.
 */

/** Stop a pointer-down from reaching the drag listeners on the card root. */
const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

/**
 * How far the pointer may drift between press and release and still count as a
 * click on the card. Matches the drag sensor's own 5px activation distance —
 * which dnd-kit measures as a straight-line distance, not per axis, so this has
 * to as well. Comparing the axes separately let a (4, 4) drag through: 5.66px
 * travelled, enough to have become a drag, and its trailing click would then
 * collapse the selection to the one card you grabbed.
 */
const CLICK_SLOP = 5;

/** Whether the pointer travelled far enough between press and release to be a drag. */
const draggedTooFar = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.hypot(to.x - from.x, to.y - from.y) > CLICK_SLOP;

/** How long the cursor must rest on a card before its zoom preview pops. */
const HOVER_DWELL_MS = 500;

export default function BoardCard({
  instance,
  zone,
}: {
  instance: CardInstance;
  /**
   * The zone this card currently sits in — drives zone-specific menu actions
   * (Retire/Discard) and the card's orientation (see `rendersLandscape`).
   */
  zone: ZoneId;
}) {
  const dispatch = useBoardDispatch();
  const scale = useBoardZoom();
  const focus = useBoardFocus();
  const backs = useBoardCardBacks();
  const groupDragging = useBoardGroupDrag();
  // The motion of the dragged card is rendered by the board's DragOverlay; this
  // element just dims in place to read as "picked up".
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: instance.uid });
  const isSelected = focus.selection.has(instance.uid);
  // Dragging one card of a selection carries the whole group, so every member
  // dims, not just the one under the cursor.
  const lifted = isDragging || (groupDragging && isSelected);

  const { card, faceDown, tapped, counters } = instance;
  const renderLandscape = rendersLandscape(zone, faceDown, card.subtype);
  const width = (renderLandscape ? BASE_WIDTH_LANDSCAPE : BASE_WIDTH) * scale;
  const src = faceDown ? cardBack(instance, backs) : (card.thumb_url ?? null);
  const inspiration = instance.inspiration ?? card.inspiration ?? null;
  const inspirationOverridden = instance.inspiration !== null;

  const rootRef = useRef<HTMLDivElement | null>(null);
  // Where the press that leads to this click started. A browser fires a click
  // after a drag as well as after a tap, and without this a group drag would end
  // by collapsing the selection to the one card you happened to grab: five cards
  // dropped into Retire, one still selected. Anything past the drag threshold is
  // a drag, and its click is not a click.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  // The zoom preview only pops after a brief dwell, so sweeping across the board
  // doesn't flash previews under the cursor.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startHover = () => {
    // Two different notions of "hovered": the shortcut target is immediate,
    // while the zoom preview waits out a dwell.
    focus.setHovered(instance.uid);
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), HOVER_DWELL_MS);
  };

  const endHover = () => {
    focus.setHovered(null);
    clearTimeout(hoverTimer.current);
    setHovered(false);
  };

  return (
    <>
      <div
        ref={(node) => {
          setNodeRef(node);
          rootRef.current = node;
        }}
        {...attributes}
        {...listeners}
        // Lets the board re-read which card is under the cursor after the layout
        // shifts beneath a still pointer — see `hoverTarget`.
        data-card-uid={instance.uid}
        // The marquee's own marker. Separate from data-card-uid on purpose.
        // See SELECTABLE_ATTR.
        {...{ [SELECTABLE_ATTR]: instance.uid }}
        onPointerDown={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
          // The listeners spread above already define onPointerDown, and this
          // prop replaces rather than adds to it, so the drag sensor's own
          // handler has to be called on. Forgetting that is what stopped every
          // card dragging once the click guard below arrived.
          listeners?.onPointerDown?.(e);
        }}
        onDoubleClick={() => dispatch({ type: 'TAP', uid: instance.uid })}
        onClick={(e) => {
          const from = pressedAt.current;
          pressedAt.current = null;
          if (from && draggedTooFar(from, { x: e.clientX, y: e.clientY })) {
            return;
          }
          // Ctrl/Cmd adds or removes this one card; a plain click collapses a
          // selection this card is part of down to it, and otherwise clears.
          // See `selectionAfterClick` for why a plain click never selects a card
          // that wasn't already selected.
          if (e.metaKey || e.ctrlKey) {
            e.stopPropagation();
            focus.toggleCard(instance.uid);
          } else {
            focus.clickCard(instance.uid);
          }
        }}
        onMouseEnter={startHover}
        onMouseLeave={endHover}
        style={{ width }}
        // The selection ring is a fixed sky hue and hover is emerald: two
        // meanings sharing one colour would be unreadable on a busy board.
        className={`group relative shrink-0 cursor-grab touch-none overflow-visible rounded-md bg-gray-200 shadow transition-transform hover:ring-2 hover:ring-emerald-400 ${
          isSelected ? 'ring-[3px] ring-sky-400' : 'ring-1 ring-black/10'
        } ${tapped ? 'rotate-90' : ''} ${lifted ? 'opacity-30' : ''}`}
      >
        <div
          style={{ aspectRatio: renderLandscape ? '88 / 63' : '63 / 88' }}
          className="relative overflow-hidden rounded-md"
        >
          <CardFace
            src={src}
            name={card.name}
            faceDown={faceDown}
            landscape={renderLandscape}
            width={width}
            backLandscape={backIsLandscape(card)}
          />
          {/*
            A wash as well as the ring, so a selected card still reads as
            selected where it is mostly tucked behind its neighbour — which is
            every card but the last in a fanned row.
          */}
          {isSelected && <div className="pointer-events-none absolute inset-0 bg-sky-400/25" />}
        </div>

        {/*
          Harmony cost (top-left) — static, at-a-glance, and outside the
          face-up gate's interactive controls because it is purely informational.
        */}
        {!faceDown && card.harmony_cost !== null && (
          <span className="pointer-events-none absolute -top-1.5 -left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs leading-none font-extrabold text-slate-900 shadow ring-2 ring-white">
            {card.harmony_cost}
          </span>
        )}

        {!faceDown && (
          <>
            {/* Counters badge (bottom-left) — click to +1; dbl-click must not tap. */}
            {counters > 0 && (
              <button
                onPointerDown={stopDrag}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'ADD_COUNTER', uid: instance.uid });
                }}
                title="Click to +1 counter"
                className="absolute bottom-0 left-0 rounded-tr bg-indigo-600 px-1 text-[10px] leading-tight font-bold text-white"
              >
                {counters}
              </button>
            )}

            {/* Inspiration badge (bottom-right) — click to +1. */}
            {inspiration !== null && (
              <button
                onPointerDown={stopDrag}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'BUMP_INSPIRATION', uid: instance.uid, delta: 1 });
                }}
                title="Click to +1 inspiration"
                className={`absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold text-white shadow ${
                  inspirationOverridden ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {inspiration}
              </button>
            )}
          </>
        )}
      </div>

      {/* Hover-zoom preview (face-up only), pinned to the bottom-right corner. */}
      {hovered && !lifted && !faceDown && <HoverPreview card={card} />}
    </>
  );
}

/**
 * A large floating card image shown while hovering, pinned to the bottom-right
 * corner.
 *
 * Portalled to the body so it escapes the board's scroll container and its
 * transformed, zoom-scaled ancestor — inside those it would be clipped and
 * scaled along with the board it is meant to be read over.
 */
export function HoverPreview({ card }: { card: CardInstance['card'] }) {
  // Portrait preview is 300 wide. A story card is the same card rotated, so its
  // frame is the flipped one — widen the box so long/short edges stay equal.
  const PORTRAIT_WIDTH = 300;
  const landscape = card.subtype === 'story';
  const width = landscape ? (PORTRAIT_WIDTH * 88) / 63 : PORTRAIT_WIDTH;

  if (!card.image_url) {
    return null;
  }

  return createPortal(
    <div
      style={{ width, aspectRatio: landscape ? '88 / 63' : '63 / 88' }}
      className="pointer-events-none fixed right-3 bottom-3 z-60 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/20"
    >
      <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
    </div>,
    document.body
  );
}
