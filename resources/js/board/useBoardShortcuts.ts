import { Dispatch, useEffect } from 'react';
import { isTypingTarget } from './shortcuts';
import {
  ADVENTURE_ZONES,
  ALL_ZONES,
  CardInstance,
  GameState,
  isToken,
  laneZoneForNumber,
  PILE_ZONES,
  ZoneId,
} from './types';
import { EMPTY_SELECTION } from './selection';
import { Action } from './useGame';

/** A card the keyboard is about to act on, with the zone it sits in. */
export interface Target {
  instance: CardInstance;
  zone: ZoneId;
}

/** Find a card instance anywhere on the board by uid, with the zone it sits in. */
export function findInstance(state: GameState, uid: string | null): Target | null {
  if (!uid) return null;
  for (const zone of ALL_ZONES) {
    const instance = state.zones[zone].find((c) => c.uid === uid);
    if (instance) return { instance, zone };
  }
  return null;
}

/**
 * Which cards a card-scoped key acts on.
 *
 * A multi-selection normally wins, because it is a deliberate, visible thing and
 * hover is transient. The exception is the cursor naming a card that is *not* in
 * the selection: that is a clear statement of intent, and honouring it is what
 * keeps the single-card muscle memory working without having to clear a
 * selection first. Making the selection win unconditionally would turn it into a
 * mode.
 *
 * "The cursor" here is the same card the single-card path resolves — the one
 * under the pointer, falling back to the one whose context menu is open. The
 * menu has to count: it is a portal, so opening it moves the pointer off the
 * card and clears `hovered`, and its rows advertise the very key hints this
 * hook implements. Reading `hovered` alone would mean right-clicking a card
 * outside the selection and pressing `t` taps the group instead of that card.
 *
 * With nothing selected this is the old behaviour exactly.
 *
 * Targets come back in board order, so a group that moves lands reading the way
 * it read on the board.
 */
export function resolveTargets(
  state: GameState,
  hovered: string | null,
  selected: string | null,
  selection: ReadonlySet<string>
): Target[] {
  const cursor = hovered ?? selected;
  if (selection.size > 0 && (cursor === null || selection.has(cursor))) {
    const targets: Target[] = [];
    for (const zone of ALL_ZONES) {
      for (const instance of state.zones[zone]) {
        if (selection.has(instance.uid)) targets.push({ instance, zone });
      }
    }
    if (targets.length > 0) return targets;
  }

  const single = findInstance(state, hovered) ?? findInstance(state, selected);

  return single ? [single] : [];
}

/**
 * Zones where `r` retires the card instead of revealing it: the Adventure lanes
 * (already public, so there is nothing left to reveal) and the Reveal Zone (the
 * card has been shown, and the Retire pile is where it goes next).
 */
const RETIRES_ON_R: ZoneId[] = [...ADVENTURE_ZONES, 'reveal'];

/**
 * The keys that act on the board rather than on a card, which is the set a
 * card-only surface drops. Space is handled ahead of the switch and so is not
 * listed here. Kept in step with `SHORTCUTS`, where every one of these is
 * declared `scope: 'board'`.
 */
const BOARD_KEYS = new Set(['d', 's', 'x', 'p', '?']);

export interface BoardShortcutOptions {
  state: GameState;
  dispatch: Dispatch<Action>;
  /** uid under the cursor — takes priority over `selected`. */
  hovered: string | null;
  /** uid whose context menu is open. */
  selected: string | null;
  /**
   * Every uid the marquee has multi-selected. Card keys act on the whole set
   * unless the cursor names a card outside it. See `resolveTargets`.
   */
  selection?: ReadonlySet<string>;
  onDraw: () => void;
  onNextTurn: () => void;
  onRevealScene: () => void;
  onTopCardToPlan: () => void;
  onPromoteStage: () => void;
  onToggleHelp: () => void;
  /** Open the card detail view. Given one card, never a selection — see `v`. */
  onViewCard: (card: CardInstance['card']) => void;
  /** Suppressed while a modal owns the screen (a hidden pile's viewer, a card detail). */
  enabled: boolean;
  /**
   * Which bindings are live. `card` drops the board-scoped keys and keeps only
   * the ones that act on the focused card, which is what the Retire viewer wants:
   * its rows are real cards and should answer to `h` or `1`, but pressing space
   * to page your turn while reading through a pile is nobody's intent.
   */
  scope?: 'all' | 'card';
}

/**
 * Bind the board's keyboard shortcuts to the window.
 *
 * Ported from PonyRec's `useBoardShortcuts.ts`. One binding did not come over:
 * Shift+Space (step back), which walks a shared turn track that arrives with the
 * turn-order slice.
 *
 * Card-scoped keys act on the card under the cursor, falling back to the one
 * whose context menu is open — so both "hover and press t" and "right-click,
 * then press t" work, which is what players reach for. With a marquee selection
 * live they act on the whole group instead; `resolveTargets` owns that choice.
 *
 * Bindings are deliberately unmodified single keys, so anything carrying a
 * modifier (⌘R, ⌃T, browser shortcuts) passes straight through untouched.
 */
export function useBoardShortcuts({
  state,
  dispatch,
  hovered,
  selected,
  selection = EMPTY_SELECTION,
  onDraw,
  onNextTurn,
  onRevealScene,
  onTopCardToPlan,
  onPromoteStage,
  onToggleHelp,
  onViewCard,
  enabled,
  scope = 'all',
}: BoardShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      const cardOnly = scope === 'card';

      // Space is the one binding that has a default worth suppressing: the
      // board still scrolls, and paging it on every turn would be maddening.
      if (event.code === 'Space') {
        if (cardOnly) return;
        event.preventDefault();
        onNextTurn();
        return;
      }

      if (cardOnly && BOARD_KEYS.has(event.key)) return;

      const targets = resolveTargets(state, hovered, selected, selection);
      // A card lying in a pile has no board state to change, and neither has a
      // token: Candy is never tapped, never turned face down, and has no printed
      // Inspiration. So the keys that change those do nothing for either. Keeps
      // the keyboard in step with the card menu, which offers no rows for them
      // either. See PILE_ZONES and isToken().
      //
      // On a selection this filters rather than refuses: a box drawn over a lane
      // catches the Candy sitting in it, and "tap this row" plainly means the
      // cards in it that can be tapped.
      const inPlay = targets.filter(
        (t) => !PILE_ZONES.includes(t.zone) && !isToken(t.instance.card)
      );
      const uids = (list: Target[]) => list.map((t) => t.instance.uid);

      switch (event.key) {
        case 't':
          // Level the group rather than toggling each card: a mixed selection
          // taps, and only an already-fully-tapped one untaps. Toggling each
          // card in turn would leave a mixed selection exactly as mixed, which
          // is never what "tap them all" meant. One card behaves as it always
          // did, since levelling a group of one is a toggle.
          if (inPlay.length > 0) {
            dispatch({
              type: 'SET_TAPPED',
              uids: uids(inPlay),
              tapped: !inPlay.every((t) => t.instance.tapped),
            });
          }
          return;
        case 'f':
          if (inPlay.length > 0) {
            dispatch({
              type: 'SET_FACE_DOWN',
              uids: uids(inPlay),
              faceDown: !inPlay.every((t) => t.instance.faceDown),
            });
          }
          return;
        case 'r': {
          // Read per card from where each one sits, then dispatched as one move
          // per destination. A token is not a deck card, so it has no Retire
          // pile to go to and nothing to reveal, and `r` takes it off the board
          // to match its menu. A card in an Adventure lane is already public, so
          // revealing it is a no-op the player would never ask for; retiring it
          // is the action that lane wants, and the most repeated one in a game.
          // A card already in the Reveal Zone has finished being shown, and the
          // Retire pile is where it goes next.
          const tokens = targets.filter((t) => isToken(t.instance.card));
          const cards = targets.filter((t) => !isToken(t.instance.card));
          for (const token of tokens) {
            dispatch({ type: 'REMOVE_CARD', uid: token.instance.uid });
          }
          const retiring = uids(cards.filter((t) => RETIRES_ON_R.includes(t.zone)));
          const revealing = uids(cards.filter((t) => !RETIRES_ON_R.includes(t.zone)));
          if (retiring.length > 0) {
            dispatch({ type: 'MOVE_CARDS', uids: retiring, toZone: 'retire' });
          }
          if (revealing.length > 0) {
            dispatch({ type: 'MOVE_CARDS', uids: revealing, toZone: 'reveal' });
          }
          return;
        }
        case 'h': {
          // Entering the hand turns the card face up, so a face-down Plan
          // picked up this way is readable straight away. A token has no hand
          // to return to, and a card already in hand has nowhere to go.
          const returning = uids(
            targets.filter((t) => t.zone !== 'hand' && !isToken(t.instance.card))
          );
          if (returning.length > 0) {
            dispatch({ type: 'MOVE_CARDS', uids: returning, toZone: 'hand' });
          }
          return;
        }
        case '1':
        case '2':
        case '3': {
          // The lane the board *labels* with that number, which is not the one in
          // that screen position when you are on the draw (see `laneNumber`).
          const lane = laneZoneForNumber(Number(event.key), state.goingFirst);
          if (!lane) return;
          const playing = uids(targets.filter((t) => t.zone !== lane));
          if (playing.length > 0) {
            dispatch({ type: 'MOVE_CARDS', uids: playing, toZone: lane });
          }
          return;
        }
        case 'v': {
          // The one card key that ignores a selection: a detail view shows one
          // card, and "view these nine" has no meaning. Resolved the same way
          // the single-card path always is, so hovering and right-clicking both
          // aim it. A face-down card is still yours to read — you know what you
          // put there — so this does not check `faceDown` the way the hover
          // preview does.
          const target = findInstance(state, hovered) ?? findInstance(state, selected);
          if (target) onViewCard(target.instance.card);
          return;
        }
        case 'z':
          // Back to the card's printed value. This is the counterpart to clicking
          // the inspiration badge, which only ever counts up.
          if (inPlay.length > 0) {
            dispatch({ type: 'SET_INSPIRATION', uids: uids(inPlay), value: null });
          }
          return;
        case 'd':
          onDraw();
          return;
        case 's':
          onRevealScene();
          return;
        case 'x':
          onPromoteStage();
          return;
        case 'p':
          onTopCardToPlan();
          return;
        case '?':
          onToggleHelp();
          return;
        default:
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    enabled,
    state,
    hovered,
    selected,
    selection,
    dispatch,
    onDraw,
    onNextTurn,
    onRevealScene,
    onTopCardToPlan,
    onPromoteStage,
    onToggleHelp,
    onViewCard,
    scope,
  ]);
}
