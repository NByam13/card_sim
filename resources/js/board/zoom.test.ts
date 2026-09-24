import { beforeEach, describe, expect, it } from 'vitest';
import { clampZoom, getZoomPreference, setZoomPreference, ZOOM_MAX, ZOOM_MIN } from './zoom';

/** Ported from PonyRec's `zoomPreference.test.ts`, with this app's cookie names. */
beforeEach(() => {
  document.cookie = 'arena_zoom=; path=/; max-age=0';
  document.cookie = 'arena_zoom_opponent=; path=/; max-age=0';
});

describe('zoom preference', () => {
  it('round-trips a surface zoom through the cookie', () => {
    setZoomPreference('board', 1.2);

    expect(document.cookie).toContain('arena_zoom=1.2');
    expect(getZoomPreference('board')).toBe(1.2);
  });

  it('keeps the surfaces independent', () => {
    setZoomPreference('board', 1.2);
    setZoomPreference('opponent', 0.7);

    expect(getZoomPreference('board')).toBe(1.2);
    expect(getZoomPreference('opponent')).toBe(0.7);
  });

  it('is null when nothing has been stored', () => {
    expect(getZoomPreference('board')).toBeNull();
    expect(getZoomPreference('opponent')).toBeNull();
  });

  it('rejects values the zoom control could not produce', () => {
    // A hand-edited or stale cookie must not zoom the board somewhere the
    // buttons cannot bring it back from.
    document.cookie = 'arena_zoom=9; path=/';
    expect(getZoomPreference('board')).toBeNull();

    document.cookie = 'arena_zoom=0.1; path=/';
    expect(getZoomPreference('board')).toBeNull();

    document.cookie = 'arena_zoom=banana; path=/';
    expect(getZoomPreference('board')).toBeNull();
  });

  it('does not confuse two cookies whose names share a prefix', () => {
    setZoomPreference('opponent', 0.7);

    expect(getZoomPreference('board')).toBeNull();
  });
});

describe('clampZoom', () => {
  it('holds the scale inside the range the controls offer', () => {
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });

  it('rounds to the nearest hundredth, so stepping cannot drift', () => {
    // 0.6 + 0.1 + 0.1 in floating point is 0.7999999999999999.
    expect(clampZoom(0.7999999999999999)).toBe(0.8);
  });

  it('leaves a value already in range alone', () => {
    expect(clampZoom(1.2)).toBe(1.2);
  });
});
