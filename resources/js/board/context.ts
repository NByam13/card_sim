import { Card } from '@/types/cards';
import { createContext, Dispatch, useContext } from 'react';
import { ZoneId } from './types';
import { Action } from './useGame';

/**
 * What a card on the board can reach without a prop threaded through every Zone.
 *
 * Ported from PonyRec's `decks/playtest/context.ts`. The Plan-slot and tokens
 * contexts are the MLP-specific ones the audit expects to move into the setup
 * module later; they stay here for the parity port.
 */

/** Lets any card on the board dispatch without threading a prop through Zone. */
const BoardDispatchContext = createContext<Dispatch<Action> | null>(null);

export const BoardDispatchProvider = BoardDispatchContext.Provider;

export function useBoardDispatch(): Dispatch<Action> {
  const dispatch = useContext(BoardDispatchContext);
  if (!dispatch) {
    throw new Error('useBoardDispatch must be used within BoardDispatchProvider');
  }
  return dispatch;
}

/**
 * Current board zoom factor. Cards read it to divide their drag transform by the
 * scale, so a dragged card tracks the pointer even when the board is CSS-scaled.
 */
const BoardZoomContext = createContext<number>(1);

export const BoardZoomProvider = BoardZoomContext.Provider;

export function useBoardZoom(): number {
  return useContext(BoardZoomContext);
}

/**
 * The backs to draw a face-down card with, from the deck snapshot. Provided by
 * the board so a card never has to build an image URL — PonyRec owns the art and
 * its location.
 */
export interface CardBacks {
  scene: string;
  generic: string;
}

const BoardCardBacksContext = createContext<CardBacks | null>(null);

export const BoardCardBacksProvider = BoardCardBacksContext.Provider;

export function useBoardCardBacks(): CardBacks | null {
  return useContext(BoardCardBacksContext);
}

/**
 * The Plan slot the next added Plan would land in, or null when all four are
 * full. Provided by the board (which holds the state) so a card's context menu
 * can hide its "To Plan" action instead of offering one that silently no-ops.
 */
const BoardPlanSlotContext = createContext<ZoneId | null>(null);

export const BoardPlanSlotProvider = BoardPlanSlotContext.Provider;

export function useBoardPlanSlot(): ZoneId | null {
  return useContext(BoardPlanSlotContext);
}

/**
 * Which card the keyboard shortcuts should act on. Cards report themselves as
 * hovered (immediately, unlike the slower hover-zoom dwell) and as selected
 * while their context menu is open; the board reads both to resolve a target.
 *
 * It also carries the multi-select: `selection` is the set of uids a marquee has
 * picked out, which cards read to draw their ring and to decide what a click on
 * them means. Local UI state throughout. It is never part of `GameState`, so it
 * is never persisted and will never reach the opponent's mirror.
 */
export interface BoardFocus {
  setHovered: (uid: string | null) => void;
  setSelected: (uid: string | null) => void;
  /** Every uid currently multi-selected, in board order. */
  selection: ReadonlySet<string>;
  /** Plain click on a card: collapse to it if it was selected, else clear. */
  clickCard: (uid: string) => void;
  /** Ctrl/Cmd click on a card: that one card joins or leaves the selection. */
  toggleCard: (uid: string) => void;
}

const BoardFocusContext = createContext<BoardFocus>({
  setHovered: () => {},
  setSelected: () => {},
  selection: new Set(),
  clickCard: () => {},
  toggleCard: () => {},
});

export const BoardFocusProvider = BoardFocusContext.Provider;

export function useBoardFocus(): BoardFocus {
  return useContext(BoardFocusContext);
}

/**
 * Open the card detail view on a card. Provided by the board, which owns the
 * dialog, and called from a card's context menu and the `v` shortcut.
 *
 * Its own context rather than part of `BoardFocus`: that one is about which card
 * the keyboard is aimed at, and this is about a surface opening over the board.
 * The default no-op means a card rendered outside a board (a test, the drag
 * overlay) simply offers nothing rather than throwing.
 */
const BoardCardViewContext = createContext<(card: Card) => void>(() => {});

export const BoardCardViewProvider = BoardCardViewContext.Provider;

export function useBoardCardView(): (card: Card) => void {
  return useContext(BoardCardViewContext);
}

/**
 * The tokens this deck can spawn (`Deck.tokens`), provided by the board and read
 * by a lane card's context menu. Empty for a deck that references none, and the
 * menu then offers no token row at all.
 */
const BoardTokensContext = createContext<Card[]>([]);

export const BoardTokensProvider = BoardTokensContext.Provider;

export function useBoardTokens(): Card[] {
  return useContext(BoardTokensContext);
}

/**
 * True while a multi-select group is being dragged. Selected cards read it to
 * dim in place alongside the one actually under the cursor, so it is visible
 * that the whole group is moving and not just the card you grabbed.
 */
const BoardGroupDragContext = createContext<boolean>(false);

export const BoardGroupDragProvider = BoardGroupDragContext.Provider;

export function useBoardGroupDrag(): boolean {
  return useContext(BoardGroupDragContext);
}
