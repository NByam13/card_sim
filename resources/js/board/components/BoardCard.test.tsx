import { Card } from '@/types/cards';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardDispatchProvider, BoardFocusProvider } from '../context';
import { SELECTABLE_ATTR } from '../selection';
import { CardInstance } from '../types';

/**
 * Ported from PonyRec's `PlaytestCard.test.tsx`.
 *
 * The drag sensor's own listeners are stood in for so a test can watch them.
 * The card root spreads dnd-kit's listeners and then declares handlers of its
 * own, and a declared prop REPLACES the spread one rather than adding to it.
 * That is not hypothetical: the click guard added for multi-select shadowed
 * `onPointerDown` and stopped every card on the board dragging.
 */
const dragListeners = { onPointerDown: vi.fn(), onKeyDown: vi.fn() };

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: dragListeners,
    setNodeRef: () => {},
    isDragging: false,
  }),
}));

const { default: BoardCard } = await import('./BoardCard');

const instance: CardInstance = {
  uid: 'card-1',
  card: {
    card_number: 'BP01-C01',
    name: 'Test Card',
    subtype: 'character',
    rarity: 'C',
    set_code: 'BP01',
    harmony_cost: null,
    inspiration: null,
    story_stage: null,
    image_url: null,
    thumb_url: '/t.webp',
    card_back_url: null,
    release_status: 'released',
    variant: null,
  } as Card,
  tapped: false,
  faceDown: false,
  counters: 0,
  inspiration: null,
};

function card(selection = new Set<string>()) {
  const focus = {
    setHovered: vi.fn(),
    setSelected: vi.fn(),
    selection,
    clickCard: vi.fn(),
    toggleCard: vi.fn(),
  };
  const dispatch = vi.fn();
  const { container } = render(
    <BoardDispatchProvider value={dispatch}>
      <BoardFocusProvider value={focus}>
        <BoardCard instance={instance} zone="adventureL" />
      </BoardFocusProvider>
    </BoardDispatchProvider>
  );

  return { focus, dispatch, root: container.querySelector(`[${SELECTABLE_ATTR}]`)! };
}

beforeEach(() => vi.clearAllMocks());

describe('BoardCard', () => {
  it("calls the drag sensor's pointer-down on, so cards still drag", () => {
    const { root } = card();

    fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });

    expect(dragListeners.onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('treats a press and release in place as a click on the card', () => {
    const { focus, root } = card(new Set(['card-1']));

    fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });
    fireEvent.click(root, { clientX: 10, clientY: 10 });

    expect(focus.clickCard).toHaveBeenCalledWith('card-1');
  });

  it('ignores the click a browser fires at the end of a drag', () => {
    // Without this, dropping a group would collapse the selection to the one
    // card you happened to grab.
    const { focus, root } = card(new Set(['card-1']));

    fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });
    fireEvent.click(root, { clientX: 90, clientY: 40 });

    expect(focus.clickCard).not.toHaveBeenCalled();
  });

  it('counts a diagonal drift past the sensor threshold as a drag', () => {
    // (4, 4) is under the slop on each axis but 5.66px travelled, so comparing
    // the axes separately would let a real drag's click through.
    const { focus, root } = card(new Set(['card-1']));

    fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });
    fireEvent.click(root, { clientX: 14, clientY: 14 });

    expect(focus.clickCard).not.toHaveBeenCalled();
  });

  it('toggles just this card on a ctrl/cmd click', () => {
    const { focus, root } = card();

    fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });
    fireEvent.click(root, { clientX: 10, clientY: 10, ctrlKey: true });

    expect(focus.toggleCard).toHaveBeenCalledWith('card-1');
    expect(focus.clickCard).not.toHaveBeenCalled();
  });

  it('rings a card that is in the selection, and leaves the rest alone', () => {
    expect(card(new Set(['card-1'])).root.className).toContain('ring-sky-400');
    expect(card().root.className).not.toContain('ring-sky-400');
  });

  it('taps on a double click', () => {
    const { dispatch, root } = card();

    fireEvent.doubleClick(root);

    expect(dispatch).toHaveBeenCalledWith({ type: 'TAP', uid: 'card-1' });
  });

  it('reports itself hovered immediately, ahead of the preview dwell', () => {
    // The shortcut target and the zoom preview are two different notions of
    // hovered; the keyboard must not wait half a second for a target.
    const { focus, root } = card();

    fireEvent.mouseEnter(root);

    expect(focus.setHovered).toHaveBeenCalledWith('card-1');
  });

  it('clears the hovered target on the way out', () => {
    const { focus, root } = card();

    fireEvent.mouseEnter(root);
    fireEvent.mouseLeave(root);

    expect(focus.setHovered).toHaveBeenLastCalledWith(null);
  });
});
