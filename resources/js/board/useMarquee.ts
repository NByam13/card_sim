import {
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  EMPTY_SELECTION,
  MARQUEE_THRESHOLD,
  Rect,
  rectFromPoints,
  startsMarquee,
  uidsInRect,
} from './selection';

interface Drag {
  origin: { x: number; y: number };
  /** The selection as it stood when the press began. Non-empty only for a shift-drag union. */
  base: ReadonlySet<string>;
  /** True once the pointer has travelled far enough for this to be a drag rather than a click. */
  live: boolean;
}

export interface Marquee {
  /** Attach to the board root: starts a marquee on a press over bare board. */
  onPointerDown: (event: ReactPointerEvent) => void;
  /** The box to draw, or null when no marquee is live. */
  rect: Rect | null;
}

/**
 * Drag a rectangle over bare board to select the cards it touches.
 *
 * Ported from PonyRec's `useMarquee.ts`.
 *
 * Coordinates are viewport-space throughout, the space `getBoundingClientRect`
 * reports and a `position: fixed` overlay paints in, so the box lands on the
 * cards actually under it whatever the board's zoom is doing. The cost is that
 * scrolling the page mid-drag leaves the box behind. That is accepted rather
 * than fixed, since a marquee is a half-second gesture.
 *
 * The selection updates live as the box grows, so you can see what you are about
 * to get. Pressing on bare board clears first (unless shift is held to union),
 * which is also what makes a plain click on the board a "deselect everything".
 * There is no separate click handler, and so nothing that could undo the
 * selection the marquee had just finished making.
 *
 * The gesture itself is tracked in a ref rather than state: a pointermove that
 * wrote to state would tear down and re-attach these listeners on every frame of
 * the drag. Only the drawn rectangle renders.
 */
export function useMarquee(
  rootRef: RefObject<HTMLElement | null>,
  selection: ReadonlySet<string>,
  setSelection: (next: ReadonlySet<string>) => void
): Marquee {
  const drag = useRef<Drag | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  // The live gesture's teardown, so an unmount mid-drag takes its window
  // listeners with it. Without this a board torn down while a box was being
  // dragged (a restart, a route change) would leave three window listeners
  // behind, still writing to a selection nothing renders any more.
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  // Read at press time, so the handler never needs re-creating as the selection
  // changes (and so a shift-drag unions with what is on screen, not a stale set).
  const current = useRef(selection);
  current.current = selection;

  return {
    rect,
    onPointerDown: useCallback(
      (event: ReactPointerEvent) => {
        // Left button only, and never on top of something that owns the press:
        // a card (dnd-kit is about to drag it) or a control. Ctrl/Cmd is the
        // per-card toggle gesture and must not paint a box.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
        if (!startsMarquee(event.target)) return;

        const origin = { x: event.clientX, y: event.clientY };
        const base = event.shiftKey ? current.current : EMPTY_SELECTION;
        drag.current = { origin, base, live: false };
        // Only when there is something to clear: re-clearing an empty selection
        // would re-render every card on the board for no change.
        if (!event.shiftKey && current.current.size > 0) setSelection(EMPTY_SELECTION);

        const move = (e: PointerEvent) => {
          const at = drag.current;
          if (!at) return;
          const far =
            Math.abs(e.clientX - at.origin.x) > MARQUEE_THRESHOLD ||
            Math.abs(e.clientY - at.origin.y) > MARQUEE_THRESHOLD;
          if (!far && !at.live) return;
          at.live = true;

          const box = rectFromPoints(at.origin, { x: e.clientX, y: e.clientY });
          setRect(box);
          const root = rootRef.current;
          if (root) setSelection(new Set([...at.base, ...uidsInRect(root, box)]));
        };

        // Release and cancel both end the gesture. A press that never went live
        // was a click, and the clear on press has already handled it.
        const end = () => {
          drag.current = null;
          endDrag.current = null;
          setRect(null);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
        };

        endDrag.current = end;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      },
      [rootRef, setSelection]
    ),
  };
}
