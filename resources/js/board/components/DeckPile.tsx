import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useEffect, useRef, useState } from 'react';
import { useBoardCardBacks, useBoardFocus, useBoardZoom } from '../context';
import { CardInstance, ZoneId } from '../types';
import { HoverPreview } from './BoardCard';
import { BASE_WIDTH, cardBack } from './CardFace';
import ZoneMenu, { ZoneMenuItem } from './ZoneMenu';

/**
 * Ported from PonyRec's `DeckPile.tsx`.
 *
 * A deck rendered as a single top card (like the top of a real deck). Clicking it
 * draws one card (when `onDraw` is set); dragging the top card moves that one card
 * anywhere. The pile is also a drop target (cards can be returned to it), but only
 * the top card is ever shown. A draw pile shows the back; a discard pile (Retire)
 * shows the most-recently-added card face-up via `faceUp` + `topFromEnd`.
 *
 * A pile with `onOpenPile` (the Retire pile, whose contents are public and whose
 * only action is to look through them) opens its viewer from anywhere inside the
 * bordered box: the label, the card, or the empty space around either. Aiming at
 * the label alone was a hard target for what is the pile's only reason to exist.
 */
export default function DeckPile({
  id,
  label,
  cards,
  onDraw,
  onOpenPile,
  menu,
  faceUp = false,
  topFromEnd = false,
}: {
  id: ZoneId;
  label: string;
  cards: CardInstance[];
  /** Click-to-draw the top card; omit for a discard pile (no draw action). */
  onDraw?: () => void;
  /**
   * Open the pile's viewer by clicking anywhere on it. Only for a pile whose
   * contents you are allowed to browse freely, which means the Retire pile. A
   * draw pile's click already means "draw", and browsing it belongs behind the
   * menu.
   */
  onOpenPile?: () => void;
  /** Pile actions — shown in the header chevron and on right-clicking the pile. */
  menu?: { label: string; items: ZoneMenuItem[] };
  /** Show the top card's face instead of the card back (e.g. Retire). */
  faceUp?: boolean;
  /** The top of the pile is the last-added card, not the first (e.g. Retire). */
  topFromEnd?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const scale = useBoardZoom();
  const focus = useBoardFocus();
  const [menuOpen, setMenuOpen] = useState(false);
  const top = topFromEnd ? cards[cards.length - 1] : cards[0];
  const topUid = top?.uid ?? null;

  // While this menu is open the top card is the shortcut target, the same way a
  // card's own context menu makes itself the target. Without it the `r` chip on
  // "Reveal top card" would be a lie: opening the menu moves the cursor off the
  // pile, so the hover target is gone by the time you could press the key.
  useEffect(() => {
    if (!menuOpen || !topUid) return;
    focus.setSelected(topUid);
    return () => focus.setSelected(null);
  }, [menuOpen, topUid, focus]);

  return (
    <div
      // Right-click anywhere on the pile opens its menu — the chevron is just
      // one way in. preventDefault suppresses the browser's own menu.
      onContextMenu={
        menu
          ? (e) => {
              e.preventDefault();
              setMenuOpen(true);
            }
          : undefined
      }
      onClick={onOpenPile}
      title={onOpenPile ? `${label}: click to look through it` : undefined}
      className={`relative rounded-lg border border-dashed p-1 transition-colors ${
        onOpenPile ? 'cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40' : ''
      } ${isOver ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-300'}`}
    >
      {/* The menu (when present) carries the label and is the full clickable
                header. Floated into the border as a badge so it costs no height.
                Its clicks stop here: the menu's own rows sit inside this box, so on a
                click-to-open pile choosing "View" from the menu would otherwise open
                the viewer a second time on the way out. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute -top-2 left-2 z-20 rounded bg-gray-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400"
      >
        {menu ? (
          <ZoneMenu
            label={menu.label}
            items={menu.items}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div ref={setNodeRef} className="flex justify-center">
        {top ? (
          <PileTopCard
            instance={top}
            count={cards.length}
            onDraw={onDraw}
            faceUp={faceUp}
            openable={onOpenPile !== undefined}
          />
        ) : (
          <div
            style={{ width: BASE_WIDTH * scale, aspectRatio: '63 / 88' }}
            className="flex items-center justify-center rounded-md border border-dashed border-gray-300 text-[9px] text-gray-300"
          >
            empty
          </div>
        )}
      </div>
    </div>
  );
}

/** The visible top card: face-down (draw pile) or face-up (discard), click to draw, drag to move. */
function PileTopCard({
  instance,
  count,
  onDraw,
  faceUp,
  openable,
}: {
  instance: CardInstance;
  count: number;
  onDraw?: () => void;
  faceUp: boolean;
  /** The pile behind this card opens its viewer on click, so say so in the tooltip. */
  openable: boolean;
}) {
  const scale = useBoardZoom();
  const focus = useBoardFocus();
  const backs = useBoardCardBacks();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: instance.uid });

  // Distinguish a click (draw) from a drag (move) by how far the pointer travelled.
  const down = useRef<{ x: number; y: number } | null>(null);

  // Compose dnd-kit's own onPointerDown with ours so the drag still starts —
  // spreading {...listeners} and then setting onPointerDown would clobber it.
  const { onPointerDown: dndPointerDown, ...dragListeners } = listeners ?? {};

  // Face-up piles (Retire) preview the top card on hover, after a brief dwell.
  const [hovered, setHovered] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startHover = () => {
    setPointerInside(true);
    if (!faceUp) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 500);
  };
  const endHover = () => {
    setPointerInside(false);
    clearTimeout(hoverTimer.current);
    setHovered(false);
  };

  // The top card is a real card instance, so it reports itself to the shared
  // shortcut focus exactly like a card on the board does, which is what makes `r`
  // reveal the top of the deck (and `t`/`f`/`h`/`1`-`3` act on it). Tied to the uid
  // rather than set once on enter, because the pile keeps this component mounted
  // and swaps the instance underneath it: drawing while hovering the Library must
  // hand the shortcuts the *new* top card, not the one now sitting in your hand.
  useEffect(() => {
    if (!pointerInside) return;
    focus.setHovered(instance.uid);
    return () => focus.setHovered(null);
  }, [pointerInside, instance.uid, focus]);

  const faceSrc = faceUp ? (instance.card.thumb_url ?? null) : cardBack(instance, backs);
  const countLabel = `${count} card${count === 1 ? '' : 's'}`;
  const title = onDraw
    ? `${countLabel}, click to draw`
    : openable
      ? `${countLabel}, click to look through the pile`
      : countLabel;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...dragListeners}
      // Same marker a board card carries, so the pile's top card is re-resolved
      // by the same hit test when the pile changes under a still cursor.
      data-card-uid={instance.uid}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        dndPointerDown?.(e);
      }}
      onClick={(e) => {
        const d = down.current;
        // A drag that ends near where it began still fires a click, and the
        // distance is the only thing telling the two apart. Swallow it rather
        // than returning: on a click-to-open pile the event would otherwise
        // bubble out and open the viewer every time you picked the card up.
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
          e.stopPropagation();
          return;
        }
        // With no draw action the click belongs to the pile behind this card
        // (the Retire pile opens its viewer), so let it through.
        if (onDraw) {
          e.stopPropagation();
          onDraw();
        }
      }}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      title={title}
      style={{ width: BASE_WIDTH * scale }}
      className={`relative shrink-0 touch-none rounded-md shadow ring-1 ring-black/10 ${
        onDraw ? 'cursor-pointer' : 'cursor-grab'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      {/* Stacked-deck depth: faint offset cards behind the top one. */}
      {count > 1 && (
        <>
          <div className="absolute left-1 top-1 h-full w-full rounded-md bg-gray-300" />
          <div className="absolute left-0.5 top-0.5 h-full w-full rounded-md bg-gray-400" />
        </>
      )}
      <div
        style={{ aspectRatio: '63 / 88' }}
        className="relative overflow-hidden rounded-md bg-gray-200"
      >
        {faceSrc ? (
          <img src={faceSrc} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight text-gray-600">
            {instance.card.name}
          </span>
        )}
      </div>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-1.5 text-[10px] font-bold leading-tight text-white tabular-nums">
        {count}
      </span>
      {faceUp && hovered && !isDragging && <HoverPreview card={instance.card} />}
    </div>
  );
}
