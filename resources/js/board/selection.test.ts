import { describe, expect, it } from 'vitest';
import {
  intersects,
  pruneSelection,
  rectFromPoints,
  SELECTABLE_ATTR,
  selectionAfterClick,
  selectionAfterToggle,
  startsMarquee,
  uidsInRect,
} from './selection';
import { ALL_ZONES, ZoneId } from './types';

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe('rectFromPoints', () => {
  it('normalises a box dragged up and to the left', () => {
    expect(rectFromPoints({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual(rect(20, 10, 100, 80));
  });
});

describe('intersects', () => {
  it('is true for overlapping boxes', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(5, 5, 20, 20))).toBe(true);
  });

  it('is true when the boxes only touch, since a card is selected by being grazed', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(true);
  });

  it('is false when they miss on either axis', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(11, 0, 20, 10))).toBe(false);
    expect(intersects(rect(0, 0, 10, 10), rect(0, 11, 10, 20))).toBe(false);
  });
});

describe('uidsInRect', () => {
  /** A selectable card element occupying a fixed viewport box. */
  function card(root: HTMLElement, uid: string, box: ReturnType<typeof rect>) {
    const element = document.createElement('div');
    element.setAttribute(SELECTABLE_ATTR, uid);
    element.getBoundingClientRect = () =>
      ({ ...box, width: box.right - box.left, height: box.bottom - box.top }) as DOMRect;
    root.appendChild(element);
    return element;
  }

  it('returns the touched cards in DOM order and skips the missed ones', () => {
    const root = document.createElement('div');
    card(root, 'a', rect(0, 0, 50, 70));
    card(root, 'b', rect(60, 0, 110, 70));
    card(root, 'c', rect(500, 0, 550, 70));

    expect(uidsInRect(root, rect(10, 10, 200, 40))).toEqual(['a', 'b']);
  });

  it('ignores elements carrying only the hover marker, so pile tops stay out', () => {
    const root = document.createElement('div');
    const pileTop = document.createElement('div');
    pileTop.setAttribute('data-card-uid', 'top-of-library');
    pileTop.getBoundingClientRect = () => ({ ...rect(0, 0, 50, 70) }) as DOMRect;
    root.appendChild(pileTop);

    expect(uidsInRect(root, rect(0, 0, 200, 200))).toEqual([]);
  });
});

describe('startsMarquee', () => {
  it('starts on bare board', () => {
    expect(startsMarquee(document.createElement('div'))).toBe(true);
  });

  it('does not start on a card, which dnd-kit is about to drag', () => {
    const card = document.createElement('div');
    card.setAttribute(SELECTABLE_ATTR, 'a');
    const inner = document.createElement('span');
    card.appendChild(inner);

    expect(startsMarquee(card)).toBe(false);
    expect(startsMarquee(inner)).toBe(false);
  });

  it('does not start on a control, or inside an opted-out region', () => {
    expect(startsMarquee(document.createElement('button'))).toBe(false);

    const rail = document.createElement('div');
    rail.setAttribute('data-no-marquee', '');
    const label = document.createElement('span');
    rail.appendChild(label);
    expect(startsMarquee(label)).toBe(false);
  });
});

describe('selectionAfterClick', () => {
  it('collapses a group to the card clicked inside it', () => {
    expect([...selectionAfterClick(new Set(['a', 'b', 'c']), 'b')]).toEqual(['b']);
  });

  it('clears on bare board', () => {
    expect([...selectionAfterClick(new Set(['a', 'b']), null)]).toEqual([]);
  });

  it('clears on a card outside the selection without selecting it', () => {
    // Deliberate: a double-click is two clicks, so selecting here would leave a
    // ring behind every double-click-to-tap.
    expect([...selectionAfterClick(new Set(['a']), 'z')]).toEqual([]);
  });

  it('hands back the set it was given when the click changes nothing', () => {
    // Identity is the point: the selection is React state, so a fresh empty set
    // on every click would re-render every card to reach the state it was in.
    const empty = new Set<string>();
    expect(selectionAfterClick(empty, null)).toBe(empty);

    const one = new Set(['a']);
    expect(selectionAfterClick(one, 'a')).toBe(one);
  });
});

describe('selectionAfterToggle', () => {
  it('adds a card that was out and removes one that was in', () => {
    expect([...selectionAfterToggle(new Set(['a']), 'b')]).toEqual(['a', 'b']);
    expect([...selectionAfterToggle(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });
});

describe('pruneSelection', () => {
  const zones = (partial: Partial<Record<ZoneId, { uid: string }[]>>) => {
    const all = {} as Record<ZoneId, { uid: string }[]>;
    for (const zone of ALL_ZONES) all[zone] = [];
    return { ...all, ...partial };
  };

  it('drops uids that have left the board', () => {
    expect([...pruneSelection(new Set(['a', 'b']), zones({ scene: [{ uid: 'a' }] }))]).toEqual([
      'a',
    ]);
  });

  it('drops a card that has gone into a pile, which draws no card to ring', () => {
    const board = zones({ scene: [{ uid: 'a' }], retire: [{ uid: 'b' }], library: [{ uid: 'c' }] });
    expect([...pruneSelection(new Set(['a', 'b', 'c']), board)]).toEqual(['a']);
  });

  it('returns the same set when nothing changed, so it cannot loop', () => {
    const selection = new Set(['a']);
    expect(pruneSelection(selection, zones({ hand: [{ uid: 'a' }, { uid: 'b' }] }))).toBe(
      selection
    );
  });
});
