import { Card } from '@/types/cards';
import { BoardDispatchProvider } from '../context';
import { CardInstance } from '../types';
import { DndContext } from '@dnd-kit/core';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HandZone from './HandZone';

/** Ported from PonyRec's `HandZone.test.tsx`. */

function inst(uid: string): CardInstance {
  return {
    uid,
    card: { name: 'Test Card', subtype: 'character' } as Card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

/**
 * A ResizeObserver that records what gets observed. dnd-kit builds its own to
 * track droppable rects, so assertions filter by target rather than counting
 * every call.
 */
const observe = vi.fn();

/** How many times `element` was handed to a ResizeObserver. */
const timesObserved = (element: Element) =>
  observe.mock.calls.filter(([target]) => target === element).length;

beforeEach(() => {
  observe.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderHand(cards: CardInstance[], dropIndex: number | null = null) {
  const ref = createRef<HTMLDivElement>();
  const hand = (dropAt: number | null) => (
    <DndContext>
      <BoardDispatchProvider value={vi.fn()}>
        <HandZone cards={cards} cardsRef={ref} dropIndex={dropAt} />
      </BoardDispatchProvider>
    </DndContext>
  );

  const { rerender, container } = render(hand(dropIndex));

  return { container, rerender: (dropAt: number | null) => rerender(hand(dropAt)) };
}

describe('HandZone', () => {
  it('keeps measuring itself across re-renders', () => {
    // Regression: the measuring ref was an inline arrow, so React detached and
    // reattached it on every render. Rebuilding the observer each time cancelled
    // its pending first delivery, the width stayed 0, and the fan collapsed into
    // a stack against the left edge.
    const { container, rerender } = renderHand([inst('a'), inst('b'), inst('c')]);
    const hand = container.firstChild as HTMLElement;

    expect(timesObserved(hand)).toBe(1);

    rerender(1);
    rerender(2);

    // Before the fix this climbed with every render, and each rebuild threw away
    // the measurement the previous observer had not yet delivered.
    expect(timesObserved(hand)).toBe(1);
  });

  it('never lays a card out left of the row, even before it has been measured', () => {
    // jsdom reports every element as 0 wide, which is also the real first-paint
    // state. A negative step there walked the cards backwards off the edge.
    const { container } = renderHand([inst('a'), inst('b'), inst('c'), inst('d')]);

    const lefts = [...container.querySelectorAll<HTMLElement>('[data-hand-slot]')].map((slot) =>
      parseFloat(slot.style.left)
    );

    expect(lefts).toHaveLength(4);
    lefts.forEach((left) => expect(left).toBeGreaterThanOrEqual(0));
    // And in reading order, never stacked in reverse.
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });
});
