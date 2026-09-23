import { describe, expect, it } from 'vitest';
import { FAN_GAP, fanLayout } from './fan';

const CARD = 90;

describe('fanLayout', () => {
  it('spaces cards a gap apart while the row still fits', () => {
    const { step, usedWidth } = fanLayout(3, CARD, 1000);

    expect(step).toBe(CARD + FAN_GAP);
    expect(usedWidth).toBe(3 * CARD + 2 * FAN_GAP);
  });

  it('overlaps the cards rather than overflowing once they stop fitting', () => {
    // 15 Scene cards is the whole Scene Deck, and the row is far too narrow.
    const available = 400;
    const { step, usedWidth } = fanLayout(15, CARD, available);

    expect(step).toBeLessThan(CARD);
    expect(usedWidth).toBeCloseTo(available);
  });

  it('centres the row in the space available', () => {
    const { startX, usedWidth } = fanLayout(2, CARD, 600);

    expect(startX).toBeCloseTo((600 - usedWidth) / 2);
  });

  it('starts at the left edge when the row is wider than its container', () => {
    // Never negative, or the first card would be clipped off the left side.
    expect(fanLayout(15, CARD, 400).startX).toBe(0);
  });

  it('handles the empty and single-card rows', () => {
    expect(fanLayout(0, CARD, 600).usedWidth).toBe(0);
    expect(fanLayout(1, CARD, 600).usedWidth).toBe(CARD);
  });

  it('survives a container it has not measured yet', () => {
    // Width is 0 on the first render, before the ResizeObserver reports.
    const { step, startX } = fanLayout(5, CARD, 0);

    expect(Number.isFinite(step)).toBe(true);
    expect(startX).toBe(0);
  });
});
