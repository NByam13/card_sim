import { Rect } from '../selection';
import { createPortal } from 'react-dom';

/**
 * The selection rectangle drawn while dragging one out over bare board.
 *
 * Portalled and fixed-position so it paints over every zone regardless of where
 * the board's own stacking contexts fall. The sticky bottom bar sits at z-30 and
 * a Story stage's Plan overlay at z-10, and a box that slid under either would
 * be worse than no box at all.
 */
export default function MarqueeBox({ rect }: { rect: Rect | null }) {
  if (!rect) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-55 rounded-sm border border-sky-400 bg-sky-400/15"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }}
    />,
    document.body
  );
}
