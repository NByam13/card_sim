import { ClientRect, DroppableContainer, pointerWithin } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import { pointerWithinVisible } from './collision';

const rect = (left: number, top: number, right: number, bottom: number): ClientRect => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

/**
 * A board scroll area from y 0 to 500, with the Scene Zone scrolled half out of
 * it, and the out-of-play bar's Hand below it from y 520.
 */
function table() {
  const scroll = document.createElement('div');
  scroll.setAttribute('data-drop-clip', '');
  scroll.getBoundingClientRect = () => rect(0, 0, 1000, 500) as DOMRect;
  const scene = document.createElement('div');
  scroll.append(scene);
  const hand = document.createElement('div');
  document.body.append(scroll, hand);

  const container = (id: string, node: HTMLElement) =>
    ({ id, node: { current: node }, disabled: false }) as unknown as DroppableContainer;

  const droppableContainers = [container('scene', scene), container('hand', hand)];
  const droppableRects = new Map([
    ['scene', rect(100, 450, 300, 700)],
    ['hand', rect(0, 520, 1000, 700)],
  ]);

  return (x: number, y: number) =>
    ({
      droppableContainers,
      droppableRects,
      pointerCoordinates: { x, y },
      active: { id: 'card' },
      collisionRect: rect(x, y, x, y),
    }) as unknown as Parameters<typeof pointerWithin>[0];
}

const firstHit = (collisions: ReturnType<typeof pointerWithin>) => collisions[0]?.id;

describe('pointerWithinVisible', () => {
  it('ignores a zone the scroll area has clipped out from under the pointer', () => {
    const at = table();

    // The bug: unclipped, the hidden Scene Zone wins a drop aimed at the Hand.
    expect(firstHit(pointerWithin(at(200, 600)))).toBe('scene');
    expect(firstHit(pointerWithinVisible(at(200, 600)))).toBe('hand');
  });

  it('still finds a zone where the scroll area shows it', () => {
    const at = table();

    expect(firstHit(pointerWithinVisible(at(200, 480)))).toBe('scene');
  });

  it('finds nothing without a pointer', () => {
    const args = table()(0, 0);

    expect(pointerWithinVisible({ ...args, pointerCoordinates: null })).toEqual([]);
  });
});
