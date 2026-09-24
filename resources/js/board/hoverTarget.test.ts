import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAN_SLIDE_MS } from './fan';
import { cardUidAt, useHoverFollowsPointer } from './hoverTarget';
import { emptyZones } from './setup';
import { GameState } from './types';

function gameState(turn = 1): GameState {
  return { zones: emptyZones(), turn, started: true, goingFirst: null, mulliganed: false };
}

/** Put a card carrying `uid` under every hit test, or bare board when null. */
function cardUnderCursor(uid: string | null) {
  let element: HTMLElement | null = null;
  if (uid !== null) {
    element = document.createElement('div');
    element.setAttribute('data-card-uid', uid);
  }
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(element);
}

/**
 * Lay different cards at different x positions, so a hit test's answer reveals
 * which point it actually used.
 */
function cardsAcross(byX: Record<number, string>) {
  vi.spyOn(document, 'elementFromPoint').mockImplementation((x) => {
    const uid = byX[x as number];
    if (uid === undefined) return null;
    const element = document.createElement('div');
    element.setAttribute('data-card-uid', uid);
    return element;
  });
}

/** Move the pointer so the hook has a position to hit-test from. */
function movePointer(x = 10, y = 10) {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('cardUidAt', () => {
  it('names the card under the point, walking up from whatever was hit', () => {
    const card = document.createElement('div');
    card.setAttribute('data-card-uid', 'card-1');
    const inner = document.createElement('img');
    card.appendChild(inner);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(inner);

    expect(cardUidAt(5, 5)).toBe('card-1');
  });

  it('is null over bare board', () => {
    cardUnderCursor(null);
    expect(cardUidAt(5, 5)).toBeNull();
  });
});

describe('useHoverFollowsPointer', () => {
  it('re-reads the target when the board changes under a still cursor', () => {
    // The bug: revealing a Hand card slides its neighbour under the cursor
    // without any mouse event, so the old uid stayed focused and the next `r`
    // acted on the card that had just moved.
    const setHovered = vi.fn();
    const { rerender } = renderHook(({ state }) => useHoverFollowsPointer(state, setHovered), {
      initialProps: { state: gameState(1) },
    });

    movePointer();
    cardUnderCursor('neighbour');
    setHovered.mockClear();

    rerender({ state: gameState(2) });

    expect(setHovered).toHaveBeenCalledWith('neighbour');
  });

  it('re-reads again once the fan has finished sliding', () => {
    // The immediate pass runs before the slide, so it can read the layout the
    // cards are leaving. The delayed pass is what catches the Hand.
    const setHovered = vi.fn();
    const { rerender } = renderHook(({ state }) => useHoverFollowsPointer(state, setHovered), {
      initialProps: { state: gameState(1) },
    });

    movePointer();
    cardUnderCursor(null);
    rerender({ state: gameState(2) });
    setHovered.mockClear();

    // The neighbour arrives partway through the slide.
    cardUnderCursor('settled');
    act(() => void vi.advanceTimersByTime(FAN_SLIDE_MS));

    expect(setHovered).toHaveBeenCalledWith('settled');
  });

  it('hit-tests where the pointer is now, not where it was when the board changed', () => {
    // Tapping a card and moving straight on to the next one used to hand the
    // target back: the delayed pass ran 150ms later against the position saved
    // when the tap happened, so the next `t` re-tapped the card just left
    // behind. Only fast play hit it, since a slower hand had already let the
    // timer fire before moving.
    const setHovered = vi.fn();
    const { rerender } = renderHook(({ state }) => useHoverFollowsPointer(state, setHovered), {
      initialProps: { state: gameState(1) },
    });
    cardsAcross({ 10: 'scene-1', 200: 'scene-2' });

    movePointer(10, 10);
    rerender({ state: gameState(2) });
    movePointer(200, 10);
    setHovered.mockClear();

    act(() => void vi.advanceTimersByTime(FAN_SLIDE_MS));

    expect(setHovered).toHaveBeenCalledWith('scene-2');
    expect(setHovered).not.toHaveBeenCalledWith('scene-1');
  });

  it('clears the target when the board moves out from under the cursor', () => {
    const setHovered = vi.fn();
    const { rerender } = renderHook(({ state }) => useHoverFollowsPointer(state, setHovered), {
      initialProps: { state: gameState(1) },
    });

    movePointer();
    cardUnderCursor(null);

    rerender({ state: gameState(2) });

    // Null is the right answer, and it is what stops a repeated key acting on a
    // card that is no longer there.
    expect(setHovered).toHaveBeenCalledWith(null);
  });

  it('does nothing at all until the pointer has been somewhere', () => {
    // A keyboard-only session must not hit-test point (0, 0) and focus whatever
    // happens to be in the corner.
    const setHovered = vi.fn();
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    const { rerender } = renderHook(({ state }) => useHoverFollowsPointer(state, setHovered), {
      initialProps: { state: gameState(1) },
    });

    rerender({ state: gameState(2) });

    expect(setHovered).not.toHaveBeenCalled();
    expect(hit).not.toHaveBeenCalled();
  });
});
