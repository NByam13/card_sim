import { useEffect, useRef } from 'react';
import { FAN_SLIDE_MS } from './fan';
import { GameState } from './types';

/**
 * Keeping the keyboard's target honest when the board moves under a still cursor.
 *
 * Cards report themselves hovered on `mouseenter` and clear it on `mouseleave`,
 * which is correct as long as it is the *cursor* that moves. It is not enough
 * when the *board* moves: revealing a Hand card takes it out of the Hand, the
 * remaining cards slide over to close the gap, and the browser fires neither
 * event because the pointer never moved. The uid left in `hovered` then names a
 * card that is somewhere else entirely, so a second press of `r` retired the card
 * it had just revealed instead of revealing the next one.
 *
 * The fix is to re-read the target from where the pointer actually is after every
 * state change, rather than trusting the last mouse event.
 */

/** Marks a card element with the instance it draws, so a hit test can name it. */
export const CARD_UID_ATTR = 'data-card-uid';

/** The uid of the card rendered under a viewport point, or null for empty board. */
export function cardUidAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);

  return element?.closest<HTMLElement>(`[${CARD_UID_ATTR}]`)?.dataset.cardUid ?? null;
}

/**
 * Re-resolve the hovered card from the pointer whenever the board changes.
 *
 * Runs twice per change. The immediate pass catches every zone that re-lays out
 * instantly; the delayed one catches the Hand and Scene Zone, whose cards *slide*
 * to their new positions, so a hit test fired before the slide finishes would
 * read the layout the cards are leaving rather than the one they are taking.
 *
 * Resolving to null is a good answer, not a failure: it means the cursor is over
 * bare board, and a card-scoped key should then do nothing at all.
 */
export function useHoverFollowsPointer(
  state: GameState,
  setHovered: (uid: string | null) => void
): void {
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    // Capture, so a card's own handlers stopping propagation cannot blind this.
    window.addEventListener('pointermove', track, true);
    return () => window.removeEventListener('pointermove', track, true);
  }, []);

  useEffect(() => {
    // No pointer seen yet: a keyboard-only player has nothing hovered anyway.
    if (!pointer.current) return;

    // Read the pointer when the hit test runs, never when it was scheduled. The
    // delayed pass fires 150ms after the board changed, and a player working
    // through a row of cards is already on the next one by then. Snapshotting
    // the position made that pass hand the target back to the card they had
    // just left, so a second press of `t` re-tapped the card they had only just
    // tapped instead of the one under the cursor.
    const resolve = () => {
      const at = pointer.current;
      if (at) setHovered(cardUidAt(at.x, at.y));
    };
    resolve();
    const settled = setTimeout(resolve, FAN_SLIDE_MS);

    return () => clearTimeout(settled);
  }, [state, setHovered]);
}
