import { BoardFocusProvider } from '../context';
import { CardInstance } from '../types';
import { Card } from '@/types/cards';
import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DeckPile from './DeckPile';
import { ZoneMenuItem } from './ZoneMenu';

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

/** DeckPile's droppable/draggable hooks need a DndContext; zoom uses its default. */
function renderPile(
  onView = vi.fn(),
  cards: CardInstance[] = [],
  items: ZoneMenuItem[] = [{ label: 'View', onClick: onView }],
  onOpenPile?: () => void
) {
  const focus = {
    setHovered: vi.fn(),
    setSelected: vi.fn(),
    selection: new Set<string>(),
    clickCard: vi.fn(),
    toggleCard: vi.fn(),
  };
  const pileWith = (next: CardInstance[]) => (
    <DndContext>
      <BoardFocusProvider value={focus}>
        <DeckPile
          id="library"
          label="Library"
          cards={next}
          menu={{ label: 'Library', items }}
          onOpenPile={onOpenPile}
        />
      </BoardFocusProvider>
    </DndContext>
  );

  const { container, rerender } = render(pileWith(cards));

  /** Re-render the same pile with a different set of cards (e.g. after a draw). */
  const withCards = (next: CardInstance[]) => rerender(pileWith(next));

  return { pile: container.firstChild as HTMLElement, onView, focus, withCards };
}

/** A pile that opens its viewer from anywhere on it, the way Retire does. */
function renderOpenablePile(cards: CardInstance[] = []) {
  const onOpenPile = vi.fn();
  const onView = vi.fn();
  const rendered = renderPile(onView, cards, [{ label: 'View', onClick: onView }], onOpenPile);
  return { ...rendered, onOpenPile };
}

/** The pile's visible top card, which is the element that reports hover. */
const topCard = () => screen.getByTitle(/card/i);

describe('DeckPile', () => {
  it('opens the menu when the pile is right-clicked', () => {
    const { pile } = renderPile();

    // Closed by default — only the label trigger shows, not the items.
    expect(screen.queryByText('View')).toBeNull();

    fireEvent.contextMenu(pile);

    expect(screen.getByText('View')).toBeTruthy();
  });

  it('suppresses the browser context menu on right-click', () => {
    const { pile } = renderPile();

    // fireEvent returns false when a handler called preventDefault.
    const notCancelled = fireEvent.contextMenu(pile);

    expect(notCancelled).toBe(false);
  });

  it('runs the chosen action', () => {
    const { pile, onView } = renderPile();

    fireEvent.contextMenu(pile);
    fireEvent.click(screen.getByText('View'));

    expect(onView).toHaveBeenCalledOnce();
  });

  it('reports its top card as the shortcut target while hovered', () => {
    // This is what lets `r` reveal the top of the deck: without it the pile's
    // top card is the one card on the board no card-scoped key can reach.
    const { focus } = renderPile(vi.fn(), [inst('top-card'), inst('under')]);

    fireEvent.mouseEnter(topCard());
    expect(focus.setHovered).toHaveBeenCalledWith('top-card');

    fireEvent.mouseLeave(topCard());
    expect(focus.setHovered).toHaveBeenLastCalledWith(null);
  });

  it('labels a menu action that has a keyboard binding', () => {
    const { pile } = renderPile(
      vi.fn(),
      [inst('top-card')],
      [
        { label: 'Shuffle', onClick: vi.fn() },
        { label: 'Draw', onClick: vi.fn(), hint: 'd' },
      ]
    );

    fireEvent.contextMenu(pile);

    expect(screen.getByText('d').tagName).toBe('KBD');
    // Shuffle has no binding, so it must not grow a chip.
    expect(screen.getByText('Shuffle').closest('button')?.querySelector('kbd')).toBeNull();
  });

  it('makes the top card the shortcut target while the menu is open', () => {
    // The menu's own `r` chip depends on this: opening the menu takes the cursor
    // off the pile, so hover alone would leave the key with nothing to act on.
    const { pile, focus } = renderPile(vi.fn(), [inst('top-card')]);

    fireEvent.contextMenu(pile);
    expect(focus.setSelected).toHaveBeenCalledWith('top-card');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(focus.setSelected).toHaveBeenLastCalledWith(null);
  });

  it('opens the pile from bare board inside it, not just from the label', () => {
    // The whole point: the Retire pile's only action used to be reachable only
    // through a badge of 9px text floated into its border.
    const { pile, onOpenPile } = renderOpenablePile([inst('top-card')]);

    fireEvent.click(pile);

    expect(onOpenPile).toHaveBeenCalledOnce();
  });

  it('opens the pile from its top card too', () => {
    const { onOpenPile } = renderOpenablePile([inst('top-card')]);

    fireEvent.click(topCard());

    expect(onOpenPile).toHaveBeenCalledOnce();
  });

  it('opens the pile when it is empty', () => {
    const { pile, onOpenPile } = renderOpenablePile([]);

    fireEvent.click(pile);

    expect(onOpenPile).toHaveBeenCalledOnce();
  });

  it('opens the pile once when the action is chosen from its own menu', () => {
    // The menu sits inside the pile box, so its clicks bubble back out through
    // the pile's own handler.
    const { pile, onView, onOpenPile } = renderOpenablePile([inst('top-card')]);

    fireEvent.contextMenu(pile);
    fireEvent.click(screen.getByText('View'));

    expect(onView).toHaveBeenCalledOnce();
    expect(onOpenPile).not.toHaveBeenCalled();
  });

  it('does not open the pile when the top card was dragged off it', () => {
    // A drag released near where it started still fires a click, and only the
    // distance travelled tells the two apart.
    const { onOpenPile } = renderOpenablePile([inst('top-card')]);

    fireEvent.pointerDown(topCard(), { clientX: 10, clientY: 10 });
    fireEvent.click(topCard(), { clientX: 60, clientY: 80 });

    expect(onOpenPile).not.toHaveBeenCalled();
  });

  it('leaves a draw pile alone, where a click already means draw', () => {
    const { pile } = renderPile();

    fireEvent.click(pile);

    // Nothing to assert but the absence of a handler: the pile is not clickable.
    expect(pile).not.toHaveAttribute('title');
  });

  it('follows the new top card when the pile changes under the cursor', () => {
    // Drawing while hovering the Library swaps the instance without a mouse
    // event, and the shortcuts must act on the card now on top, not the one
    // that just went to hand.
    const { focus, withCards } = renderPile(vi.fn(), [inst('top-card'), inst('under')]);

    fireEvent.mouseEnter(topCard());
    withCards([inst('under')]);

    expect(focus.setHovered).toHaveBeenLastCalledWith('under');
  });
});
