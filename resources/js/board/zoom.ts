import { useCallback, useState } from 'react';

/**
 * How large the board draws its cards, and remembering that across visits.
 *
 * Ported from PonyRec's `zoomPreference.ts`, with the bounds moved here from the
 * component that used to own them: the preference has to clamp what it reads
 * out of a cookie, and importing a constant from a React component to do that
 * made a pure module depend on the tree.
 */

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;
export const ZOOM_STEP = 0.1;

/**
 * One cookie per surface, because the three are looked at differently: your own
 * board is where you work, the opponent's mirror is glanced at, and a spectator
 * sees two boards at once. Only `board` exists in this slice; the other two
 * arrive with the mirrors that need them.
 */
const COOKIES = {
  board: 'arena_zoom',
  opponent: 'arena_zoom_opponent',
  spectator: 'arena_zoom_spectator',
} as const;

export type ZoomSurface = keyof typeof COOKIES;

/** Round to the step, and keep it inside the bounds the controls offer. */
export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(scale * 100) / 100));
}

/**
 * The remembered zoom for a surface, or null when there is none to trust.
 *
 * A cookie is a string a player can edit, so anything unparseable or out of
 * bounds is treated as absent rather than clamped into range: a value that far
 * off did not come from the controls, and honouring it halfway is a guess.
 */
export function getZoomPreference(surface: ZoomSurface): number | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIES[surface]}=([^;]*)`));
  const value = Number(match?.[1]);
  if (!Number.isFinite(value) || value < ZOOM_MIN || value > ZOOM_MAX) return null;

  return value;
}

export function setZoomPreference(surface: ZoomSurface, scale: number): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${COOKIES[surface]}=${scale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Board zoom as state, written back to the cookie as it changes. */
export function usePersistentZoom(
  surface: ZoomSurface,
  fallback: number
): [number, (next: number) => void] {
  const [scale, setScale] = useState(() => getZoomPreference(surface) ?? fallback);

  const update = useCallback(
    (next: number) => {
      setScale(next);
      setZoomPreference(surface, next);
    },
    [surface]
  );

  return [scale, update];
}
