import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../zoom';

// Deliberately small. This is a set-once control that sits in the corner of a
// board already dense with cards, so it should read as a hint, not a toolbar.
const BTN =
  'flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold leading-none text-gray-700 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50 disabled:opacity-40';

/**
 * Compact −/percent/+/reset zoom bar. Scaling is applied by the board wrapper.
 *
 * The bounds live in `board/zoom.ts` with the preference that has to clamp
 * against them, rather than here where a pure module would have to import from
 * the React tree to read them.
 */
export default function ZoomControls({
  scale,
  onChange,
}: {
  scale: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        className={BTN}
        onClick={() => onChange(clampZoom(scale - ZOOM_STEP))}
        disabled={scale <= ZOOM_MIN}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        className="min-w-9 rounded-full px-1 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums text-gray-500 hover:bg-gray-100"
        onClick={() => onChange(1)}
        title="Reset zoom"
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        className={BTN}
        onClick={() => onChange(clampZoom(scale + ZOOM_STEP))}
        disabled={scale >= ZOOM_MAX}
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
