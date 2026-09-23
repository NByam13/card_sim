import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Dispatch, ReactNode, RefObject, useRef, useState } from 'react';
import {
  BoardCardBacksProvider,
  BoardDispatchProvider,
  BoardGroupDragProvider,
  BoardPlanSlotProvider,
  BoardZoomProvider,
  CardBacks,
} from '../context';
import { useMarquee } from '../useMarquee';
import { ALL_ZONES, CardInstance, GameState, rendersLandscape, ZoneId } from '../types';
import { Action, nextPlanSlot } from '../useGame';
import CardFace, { backIsLandscape, BASE_WIDTH, BASE_WIDTH_LANDSCAPE, cardBack } from './CardFace';
import MarqueeBox from './MarqueeBox';

/**
 * Everything a table does that has nothing to do with which game is being
 * played: drag and drop, the drag overlay, group drags, measuring where a card
 * would slot into the hand, the marquee, and the scroll container.
 *
 * This is the generic half of PonyRec's `PlaytestBoard`, split out from the
 * hand-built MLP table that used to share the file. It knows the zone ids only
 * as opaque droppable names, so the only thing it would need to become truly
 * game-agnostic is for `ZoneId` to stop being MLP's union — which is the
 * generalisation the spec defers.
 *
 * @see documentation/local-board/spec.md
 */

/** What the layout needs from the shell to render the hand. */
export interface HandWiring {
  /**
   * Attach to the hand's card area. The shell measures each card's position
   * through it to turn a drop's pointer-x into an insertion index.
   */
  cardsRef: RefObject<HTMLDivElement | null>;
  /** Live insertion slot while a card hovers the hand, or null. Drives the marker. */
  dropIndex: number | null;
}

interface ActiveDrag {
  instance: CardInstance;
  landscape: boolean;
  faceDown: boolean;
  /**
   * Every uid this drag is carrying, in board order. One card for an ordinary
   * drag; the whole selection when the card picked up was part of one.
   */
  uids: string[];
}

/**
 * The card that follows the cursor while dragging, rendered above everything via
 * DragOverlay.
 *
 * A group drag draws the picked card with two stubs fanned behind it and a count
 * badge, rather than N real cards: the point is to say "you are moving this
 * many", and stacking six actual card images would be a smear the size of the
 * board.
 */
function OverlayCard({
  instance,
  landscape,
  faceDown,
  uids,
  scale,
  backs,
}: ActiveDrag & { scale: number; backs: CardBacks | null }) {
  const width = (landscape ? BASE_WIDTH_LANDSCAPE : BASE_WIDTH) * scale;
  const src = faceDown ? cardBack(instance, backs) : (instance.card.thumb_url ?? null);
  const count = uids.length;

  return (
    <div style={{ width }} className="relative cursor-grabbing">
      {count > 1 &&
        [2, 1].map((depth) => (
          <div
            key={depth}
            style={{
              aspectRatio: landscape ? '88 / 63' : '63 / 88',
              transform: `translate(${depth * 5}px, ${depth * -5}px)`,
            }}
            className="absolute inset-x-0 top-0 rounded-md bg-gray-300 shadow-lg ring-2 ring-emerald-400"
          />
        ))}
      <div className="relative rounded-md shadow-2xl ring-2 ring-emerald-400">
        <div
          style={{ aspectRatio: landscape ? '88 / 63' : '63 / 88' }}
          className="relative overflow-hidden rounded-md bg-gray-200"
        >
          <CardFace
            src={src}
            name={instance.card.name}
            faceDown={faceDown}
            landscape={landscape}
            width={width}
            backLandscape={backIsLandscape(instance.card)}
          />
        </div>
        {count > 1 && (
          <span className="absolute -bottom-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500 px-1.5 text-xs leading-none font-extrabold text-white shadow ring-2 ring-white tabular-nums">
            {count}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BoardShell({
  state,
  dispatch,
  scale,
  backs,
  header,
  gameZone,
  outOfPlayBar,
  selection,
  setSelection,
}: {
  state: GameState;
  dispatch: Dispatch<Action>;
  /** Card zoom factor (the board itself stays at 1×; only cards scale). */
  scale: number;
  /** The face-down art for this game's cards, from the deck snapshot. */
  backs: CardBacks | null;
  /**
   * Content that scrolls above the table. It belongs inside the scroll area
   * rather than above it so it can be scrolled away, instead of permanently
   * eating height the table needs.
   */
  header?: ReactNode;
  /** The table itself, laid out by the game setup. Scrolls. */
  gameZone: ReactNode;
  /**
   * The bar of out-of-play piles and the hand. A sibling of the scroll area
   * rather than a `sticky` child of it: dnd-kit resolves a droppable's
   * scrollable ancestor by walking the DOM, and a sticky droppable inside a
   * scroller both auto-scrolls the board on a hand reorder and mis-locates
   * itself as that scroll runs. Keeping the bar out of the scroller is the fix.
   */
  outOfPlayBar: (hand: HandWiring) => ReactNode;
  /** Every uid the marquee has picked out. Owned by the caller; drawn and dragged here. */
  selection: ReadonlySet<string>;
  setSelection: (next: ReadonlySet<string>) => void;
}) {
  // A small drag threshold so clicks and double-clicks aren't swallowed as drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const handCardsRef = useRef<HTMLDivElement | null>(null);
  const [handDropIndex, setHandDropIndex] = useState<number | null>(null);
  // The marquee is scoped to this element, so a box can only ever pick up cards
  // on this board.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const marquee = useMarquee(boardRef, selection, setSelection);

  /**
   * The cards a drag starting on `uid` carries: the whole selection when the
   * card picked up belongs to one, otherwise just that card. Board order, so a
   * group lands reading the way it read on the board.
   */
  function draggedUids(uid: string): string[] {
    if (!selection.has(uid)) return [uid];
    const group: string[] = [];
    for (const zone of ALL_ZONES) {
      for (const card of state.zones[zone]) {
        if (selection.has(card.uid)) group.push(card.uid);
      }
    }
    return group;
  }

  // Current pointer x, reconstructed from the drag's origin plus its accumulated
  // delta (dnd-kit doesn't hand us the live pointer on end/move events).
  const pointerX = (e: DragMoveEvent | DragEndEvent) =>
    ((e.activatorEvent as PointerEvent).clientX ?? 0) + e.delta.x;

  /**
   * How many hand cards (excluding the ones being dragged) sit left of the
   * pointer, which is exactly the index the card should land at — so its
   * left/middle/right position is preserved instead of always appending to the
   * end.
   *
   * Every dragged card is skipped, not just the one under the cursor, because a
   * group move takes them all out of the hand before putting them back. That is
   * the same contract `MOVE_CARDS` keeps.
   */
  function handDropIndexAt(clientX: number, dragged: string[]): number {
    const container = handCardsRef.current;
    if (!container) {
      return state.zones.hand.length;
    }
    const moving = new Set(dragged);
    let index = 0;
    for (const slot of container.querySelectorAll<HTMLElement>('[data-hand-slot]')) {
      if (slot.dataset.handSlot && moving.has(slot.dataset.handSlot)) {
        continue;
      }
      const rect = slot.getBoundingClientRect();
      if (clientX > rect.left + rect.width / 2) {
        index++;
      }
    }
    return index;
  }

  function handleDragStart(e: DragStartEvent) {
    const uid = String(e.active.id);
    for (const zone of ALL_ZONES) {
      const instance = state.zones[zone].find((c) => c.uid === uid);
      if (instance) {
        setActive({
          instance,
          // Same rule the card itself uses, so the drag preview matches what it
          // will look like when it lands.
          landscape: rendersLandscape(zone, instance.faceDown, instance.card.subtype),
          faceDown: instance.faceDown,
          uids: draggedUids(uid),
        });
        return;
      }
    }
  }

  // While hovering the hand, track where the card would slot in so the marker
  // and the eventual drop agree.
  function handleDragMove(e: DragMoveEvent) {
    if (e.over?.id === 'hand') {
      setHandDropIndex(handDropIndexAt(pointerX(e), active?.uids ?? [String(e.active.id)]));
    } else if (handDropIndex !== null) {
      setHandDropIndex(null);
    }
  }

  // Cards are draggable-only and zones droppable-only, so `over` is always a
  // zone (or null when released outside any). pointerWithin keeps it from
  // snapping to a neighbouring zone you are only passing over.
  function handleDragEnd(e: DragEndEvent) {
    const dragged = active?.uids ?? [String(e.active.id)];
    setActive(null);
    setHandDropIndex(null);
    const { over } = e;
    if (!over) return;
    const toZone = over.id as ZoneId;
    // The hand keeps position: drop between cards based on where you release.
    // Returning a card to a deck sets it on top (index 0), like looking at the
    // top card and placing it back; everywhere else it appends to the end.
    const toIndex =
      toZone === 'hand'
        ? handDropIndexAt(pointerX(e), dragged)
        : toZone === 'library' || toZone === 'sceneDeck'
          ? 0
          : undefined;
    // One action, not one per card: MOVE_CARDS lifts them all before setting any
    // down, so a group dropped into the hand lands as a block at the insertion
    // point instead of each removal shifting the index under the next.
    dispatch({ type: 'MOVE_CARDS', uids: dragged, toZone, toIndex });
  }

  return (
    <BoardDispatchProvider value={dispatch}>
      <BoardZoomProvider value={scale}>
        <BoardCardBacksProvider value={backs}>
          <BoardPlanSlotProvider value={nextPlanSlot(state.zones)}>
            {/*
              True only while a drag is carrying more than the card under the
              cursor, so the rest of the group can dim in place too.
            */}
            <BoardGroupDragProvider value={(active?.uids.length ?? 0) > 1}>
              <div
                ref={boardRef}
                onPointerDown={marquee.onPointerDown}
                // select-none, because dragging a marquee across the board would
                // otherwise ALSO drag the browser's own text selection, lighting
                // up card art and zone labels behind the box. It is worst across
                // the Hand, where the cards overlap. A selection begins at the
                // element the press landed on, so refusing it here stops one
                // ever starting, however far the box is then dragged.
                className="flex min-h-0 flex-1 flex-col select-none"
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={pointerWithin}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => {
                    setActive(null);
                    setHandDropIndex(null);
                  }}
                >
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-3 pb-4 sm:px-6 lg:px-8">
                      {header}
                      {gameZone}
                    </div>

                    {outOfPlayBar({ cardsRef: handCardsRef, dropIndex: handDropIndex })}
                  </div>

                  <DragOverlay dropAnimation={null}>
                    {active && <OverlayCard {...active} scale={scale} backs={backs} />}
                  </DragOverlay>
                </DndContext>
              </div>
              <MarqueeBox rect={marquee.rect} />
            </BoardGroupDragProvider>
          </BoardPlanSlotProvider>
        </BoardCardBacksProvider>
      </BoardZoomProvider>
    </BoardDispatchProvider>
  );
}
