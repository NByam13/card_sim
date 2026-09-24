import { ALL_ZONES, PILE_ZONES, ZoneId } from './types';

/**
 * Multi-select: which cards a drag-out rectangle covers, and what a selection
 * is worth once you have one.
 *
 * The selection is deliberately *not* game state. It never enters `GameState`,
 * so it is never persisted, never redacted, and never broadcast. Your opponent
 * cannot see what you have highlighted, and a reconnect comes back with nothing
 * selected. It lives in React state on the arena and reaches the cards through
 * the focus context.
 */

/**
 * Marks a card the marquee is allowed to pick up.
 *
 * Deliberately not the existing `data-card-uid`, which the hover target reads:
 * the top card of the Library and Scene Deck piles carries that one so `r` and
 * `p` can reach the top of the deck, and a pile's top face is a picture of a
 * pile rather than a card in play. Dragging a box across the bottom bar must
 * pick up your hand, not your deck. Only `BoardCard` sets this.
 */
export const SELECTABLE_ATTR = 'data-selectable-uid';

/** The two hidden decks, which draw a pile face rather than their cards. */
const DECK_PILES: ZoneId[] = ['library', 'sceneDeck'];

/** A viewport-space rectangle, the same coordinate space as `getBoundingClientRect`. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The rectangle spanned by two points, in either drag direction. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/**
 * Whether two rectangles overlap at all.
 *
 * Touching counts as overlapping (`<=` rather than `<` on the misses), because a
 * card is selected by being *touched* by the box, not by being enclosed in it.
 * Requiring containment would make the Scene Zone, the row this feature exists
 * for, need a box taller than the cards, which at high zoom means dragging off
 * the top of the board.
 */
export function intersects(a: Rect, b: Rect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

/** How far the pointer must travel before a press becomes a marquee and not a click. */
export const MARQUEE_THRESHOLD = 4;

/**
 * The uids of every selectable card inside `root` that `rect` touches, in DOM
 * order. That is board order, so a selection reads the way the board does.
 */
export function uidsInRect(root: HTMLElement, rect: Rect): string[] {
  const hits: string[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(`[${SELECTABLE_ATTR}]`)) {
    const uid = element.getAttribute(SELECTABLE_ATTR);
    if (uid && intersects(rect, element.getBoundingClientRect())) hits.push(uid);
  }
  return hits;
}

/**
 * Whether a press at this element should start a marquee.
 *
 * Anything that already owns a pointer-down says no: a card (dnd-kit is about to
 * drag it), a control (the ⋮ menu, the counter and inspiration badges, the whole
 * right-hand rail), or anything that opted out. A press with a modifier other
 * than shift says no too. Shift is the union gesture and ctrl/cmd-click toggles
 * a single card, and neither of those should paint a box.
 */
export function startsMarquee(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return !target.closest(
    `[${SELECTABLE_ATTR}], button, a, input, select, textarea, [role="button"], [data-no-marquee]`
  );
}

/**
 * The one empty selection, shared by everything that clears one.
 *
 * Identity matters: the selection is React state, so handing back a fresh empty
 * `Set` on every click on a card or on bare board would re-render every card on
 * the board to arrive at the state it was already in.
 */
export const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** The selection after a plain (unmodified) click on `uid`, or on bare board when null. */
export function selectionAfterClick(
  selection: ReadonlySet<string>,
  uid: string | null
): ReadonlySet<string> {
  // Clicking one of the selected cards keeps that card and drops the rest, so a
  // group can be narrowed to its one interesting member without re-dragging.
  // Clicking anywhere else clears it outright, whether that is bare board or a
  // card outside the selection. Note what that last case does NOT do: it does not select
  // the card you clicked. Selecting on every plain click would leave a ring
  // behind after every double-click-to-tap, since a double-click is two clicks.
  // Ctrl/Cmd-click is how a selection is built card by card.
  // Each branch hands back the set it was given when that is already the answer,
  // so a click that changes nothing re-renders nothing.
  if (uid !== null && selection.has(uid)) {
    return selection.size === 1 ? selection : new Set([uid]);
  }
  return selection.size === 0 ? selection : EMPTY_SELECTION;
}

/** The selection after a ctrl/cmd-click on `uid`. That card alone joins or leaves. */
export function selectionAfterToggle(
  selection: ReadonlySet<string>,
  uid: string
): ReadonlySet<string> {
  const next = new Set(selection);
  if (!next.delete(uid)) next.add(uid);
  return next;
}

/**
 * The zones a selection can hold cards in: the ones that draw each card as its
 * own face on the board. The three piles draw a stack, not cards, so a card that
 * lands in one has no ring to show and nothing the keyboard would do to it.
 * Leaving it selected would have the chip counting cards nobody can see. It also
 * means the obvious move, bulk-retiring a row, ends with the selection empty,
 * which is exactly where it should end.
 */
const SELECTABLE_ZONES = ALL_ZONES.filter(
  (zone) => !PILE_ZONES.includes(zone) && !DECK_PILES.includes(zone)
);

/**
 * Drop any uid that is no longer selectable, whether it has left the board
 * entirely or gone into one of the piles.
 *
 * Removing a token takes it off the board outright rather than to a pile, so a
 * selection that held one would otherwise keep counting a card that no longer
 * exists. Returns the same set when nothing changed, so this can run on every
 * state change without re-rendering the board.
 */
export function pruneSelection(
  selection: ReadonlySet<string>,
  zones: Record<ZoneId, { uid: string }[]>
): ReadonlySet<string> {
  const selectable = new Set(SELECTABLE_ZONES.flatMap((zone) => zones[zone].map((c) => c.uid)));
  const live = [...selection].filter((uid) => selectable.has(uid));

  return live.length === selection.size ? selection : new Set(live);
}
