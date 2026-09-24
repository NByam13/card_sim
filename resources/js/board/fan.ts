import { useCallback, useEffect, useState } from 'react';

/**
 * The fan: a row of cards that lays out left to right and, once the cards no
 * longer fit side by side, slides them under each other so the row's width stays
 * capped and it never wraps onto a second line.
 *
 * The Hand has always worked this way. The Scene Zone now does too, because a
 * Scene Deck runs to 15 cards and a wrapped second row costs vertical space that
 * the two-player table cannot spare. Shared here so the two can't drift.
 */

/** Gap (px) between cards while the whole row still fits without overlapping. */
export const FAN_GAP = 8;

/**
 * How long a card takes to slide to its new place when the row re-lays out.
 * Must match the `duration-150` on the fanned card wrappers: anything that needs
 * to wait for the row to settle (a hit test under a still cursor) reads it here.
 */
export const FAN_SLIDE_MS = 150;

export interface FanLayout {
  /** Distance between successive left edges. Below `cardWidth` once they overlap. */
  step: number;
  /** Total width the laid-out row occupies. */
  usedWidth: number;
  /** Left edge of the first card, which centres the row in the space available. */
  startX: number;
}

/**
 * Where each card in a fan of `count` sits. Cards sit a gap apart until the full
 * row would overflow `available`, at which point the step shrinks so the fan
 * always fits exactly.
 */
export function fanLayout(
  count: number,
  cardWidth: number,
  available: number,
  gap: number = FAN_GAP
): FanLayout {
  const fullWidth = count * cardWidth + Math.max(0, count - 1) * gap;
  const overflows = count > 1 && available > 0 && fullWidth > available;
  // Never negative, which would walk the cards backwards off the left edge. It
  // goes to zero only when the row is narrower than a single card; an
  // unmeasured row (width 0) lays out unoverlapped until its first measurement.
  const step = overflows ? Math.max(0, (available - cardWidth) / (count - 1)) : cardWidth + gap;
  const usedWidth = count > 0 ? (count - 1) * step + cardWidth : 0;

  return { step, usedWidth, startX: Math.max(0, (available - usedWidth) / 2) };
}

/**
 * Track an element's content width so a fan can compress to fit it. Returns a
 * callback ref, so it composes with the other refs a droppable row already
 * carries (dnd-kit's, plus the Hand's own measuring ref).
 *
 * The observer's lifetime is tied to the **node**, not to the render count. That
 * matters because a caller composing refs may hand React a fresh closure each
 * render, which React answers by detaching and reattaching the ref every time.
 * Rebuilding the observer on each of those cancelled its pending (asynchronous)
 * first delivery, so the width never left 0 and the fan collapsed into a stack
 * at the left edge. Callers should still memoise a composed ref, but this hook
 * no longer depends on them doing so.
 */
export function useMeasuredWidth(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);

  // Identity-stable across renders (a `useState` setter is), so React attaches
  // and detaches it only when the element itself changes.
  const ref = useCallback((next: HTMLElement | null) => setNode(next), []);

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    setWidth(node.clientWidth);

    return () => observer.disconnect();
  }, [node]);

  return [ref, width];
}
