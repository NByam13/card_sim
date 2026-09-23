import { BoardFocusProvider } from '../context';
import { CardInstance } from '../types';
import { Card } from '@/types/cards';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ZoneViewerModal from './ZoneViewerModal';

function inst(uid: string, name: string): CardInstance {
  return {
    uid,
    card: {
      id: 1,
      name,
      card_number: 'BP01-C01',
      subtype: 'character',
      thumb_url: `/thumb/${uid}.webp`,
      image_url: `/full/${uid}.webp`,
    } as Card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

function viewer(zone: 'library' | 'retire' | 'sceneDeck', cards = [inst('c1', 'Applejack')]) {
  const focus = {
    setHovered: vi.fn(),
    setSelected: vi.fn(),
    selection: new Set<string>(),
    clickCard: vi.fn(),
    toggleCard: vi.fn(),
  };
  const dispatch = vi.fn();
  render(
    <BoardFocusProvider value={focus}>
      <ZoneViewerModal zone={zone} cards={cards} dispatch={dispatch} onClose={() => {}} />
    </BoardFocusProvider>
  );

  return { focus, dispatch };
}

/**
 * A card's row, found by the name it shows. Scoped to the dialog because the
 * hover preview is portaled to the body and renders the same name.
 */
function row(name: string): HTMLElement {
  const label = within(screen.getByRole('dialog')).getByText(name);
  return label.closest('[class*="rounded-lg"]') as HTMLElement;
}

/** Let the hover dwell elapse, which is what pops the zoom preview. */
function dwell() {
  act(() => vi.advanceTimersByTime(600));
}

/** The large floating preview, identified by the full-size art it loads. */
function preview(uid: string): HTMLElement | null {
  return document.querySelector(`img[src="/full/${uid}.webp"]`);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ZoneViewerModal', () => {
  it('previews a card in the pile on hover, as the board does everywhere else', () => {
    viewer('retire');

    fireEvent.mouseEnter(row('Applejack'));
    dwell();

    expect(preview('c1')).not.toBeNull();
  });

  it('drops the preview when the pointer leaves', () => {
    viewer('retire');

    fireEvent.mouseEnter(row('Applejack'));
    dwell();
    fireEvent.mouseLeave(row('Applejack'));

    expect(preview('c1')).toBeNull();
  });

  it('waits out the dwell so scrolling the list does not flash previews', () => {
    viewer('retire');

    fireEvent.mouseEnter(row('Applejack'));
    act(() => vi.advanceTimersByTime(100));

    expect(preview('c1')).toBeNull();
  });

  it('previews from a hidden pile too, where the keyboard stays out', () => {
    viewer('library');

    fireEvent.mouseEnter(row('Applejack'));
    dwell();

    expect(preview('c1')).not.toBeNull();
  });

  it('makes a hovered Retire card the keyboard target', () => {
    // This is what lets `h` or `1` pull a card back out of the pile.
    const { focus } = viewer('retire');

    fireEvent.mouseEnter(row('Applejack'));
    expect(focus.setHovered).toHaveBeenCalledWith('c1');

    fireEvent.mouseLeave(row('Applejack'));
    expect(focus.setHovered).toHaveBeenLastCalledWith(null);
  });

  it('takes the keyboard off the search field when the pointer reaches a card', () => {
    // The field autofocuses, so without this every card key is a search term.
    viewer('retire');
    const search = screen.getByPlaceholderText(/Search retire/i);
    expect(document.activeElement).toBe(search);

    fireEvent.mouseEnter(row('Applejack'));

    expect(document.activeElement).not.toBe(search);
  });

  it('opens the card menu on a Retire row', () => {
    viewer('retire');

    fireEvent.contextMenu(row('Applejack'));

    // A row only the card menu has, so this cannot be confused with the tutor
    // buttons the viewer already renders on every row.
    expect(screen.getByText('Send to top of deck')).toBeInTheDocument();
  });

  it('dispatches from that menu, which needs a dispatcher this modal provides', () => {
    const { dispatch } = viewer('retire');

    fireEvent.contextMenu(row('Applejack'));
    fireEvent.click(screen.getByText('Send to top of deck'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARD',
      uid: 'c1',
      toZone: 'library',
      toIndex: 0,
    });
  });

  it('leaves a hidden pile out of the keyboard and the card menu', () => {
    // Taking a card out of the Library has to reshuffle what reading it exposed,
    // which is the TUTOR action the row's own buttons dispatch. A card menu here
    // would move it without that.
    const { focus } = viewer('library');

    fireEvent.mouseEnter(row('Applejack'));
    fireEvent.contextMenu(row('Applejack'));

    expect(focus.setHovered).not.toHaveBeenCalled();
    expect(screen.queryByText('Send to top of deck')).not.toBeInTheDocument();
  });

  it('keeps the tutor buttons each zone offers', () => {
    viewer('sceneDeck');

    const actions = within(row('Applejack'));
    expect(actions.getByText('To scene')).toBeInTheDocument();
    expect(actions.getByText('To hand')).toBeInTheDocument();
    expect(actions.getByText('To bottom')).toBeInTheDocument();
  });
});
