import { Card, Deck } from '@/types/cards';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyZones } from '../setup';
import { CardInstance, GameState } from '../types';
import BoardArena from './BoardArena';

/**
 * Ported from PonyRec's `PlaytestArena.test.tsx` — the part of it that applies.
 *
 * Seventeen of its twenty-three tests drive the shared turn cursor, the rival's
 * mirror and the phase rings, none of which exist in this slice. They port with
 * the turn-order and sync slices that add them back.
 */
function card(n: number, name: string): Card {
  return {
    name,
    card_number: `BP01-C0${n}`,
    subtype: 'character',
    thumb_url: `/thumb/${n}.webp`,
    image_url: `/full/${n}.webp`,
  } as Card;
}

function inst(uid: string, from: Card): CardInstance {
  return { uid, card: from, tapped: false, faceDown: false, counters: 0, inspiration: null };
}

const deck: Deck = {
  code: 'test-deck',
  name: 'Test Deck',
  main_character: null,
  cards: [{ card: card(1, 'Applejack'), zone: 'main', quantity: 1 }],
  tokens: [],
  card_backs: { scene: '/backs/scene.webp', generic: '/backs/generic.webp' },
};

/**
 * A board resumed with one card already retired. Going through `savedState`
 * saves the test from having to drag a card into the pile through dnd-kit.
 */
function boardWithRetiredCard(): GameState {
  const zones = emptyZones();
  zones.retire = [inst('retired-1', card(1, 'Applejack'))];
  zones.library = [inst('lib-1', card(2, 'Rarity'))];

  return { zones, turn: 1, started: true, goingFirst: true, mulliganed: false };
}

function arena() {
  const onState = vi.fn();
  render(
    <BoardArena deck={deck} scale={1} savedState={boardWithRetiredCard()} onState={onState} />
  );

  /** The most recent state the arena announced, which is the current board. */
  const latest = (): GameState => onState.mock.lastCall?.[0] as GameState;

  return { latest };
}

/** The Retire pile's bordered box, which is clickable in full. */
function retirePile(): HTMLElement {
  return screen.getByTitle(/Retire: click to look through it/i);
}

/** The Library pile, which keeps browsing behind its own menu. */
function libraryPile(): HTMLElement {
  return screen.getByText('Library').closest('[class*="border-dashed"]') as HTMLElement;
}

/** A card's row inside the open viewer, scoped so the hover preview cannot match. */
function viewerRow(name: string): HTMLElement {
  const label = within(screen.getByRole('dialog')).getByText(name);
  return label.closest('[class*="rounded-lg"]') as HTMLElement;
}

describe('BoardArena, browsing the Retire pile', () => {
  it('opens the viewer by clicking anywhere on the pile', () => {
    arena();

    fireEvent.click(retirePile());

    expect(within(screen.getByRole('dialog')).getByText('Applejack')).toBeInTheDocument();
  });

  it('returns a hovered card to hand with h, the key it answers to on the board', () => {
    const { latest } = arena();

    fireEvent.click(retirePile());
    fireEvent.mouseEnter(viewerRow('Applejack'));
    fireEvent.keyDown(window, { key: 'h' });

    expect(latest().zones.retire).toHaveLength(0);
    expect(latest().zones.hand.map((c) => c.uid)).toEqual(['retired-1']);
  });

  it('plays a hovered card straight into an Adventure lane', () => {
    const { latest } = arena();

    fireEvent.click(retirePile());
    fireEvent.mouseEnter(viewerRow('Applejack'));
    fireEvent.keyDown(window, { key: '1' });

    expect(latest().zones.adventureL.map((c) => c.uid)).toEqual(['retired-1']);
  });

  it('leaves the board keys out of it, so space does not page the turn', () => {
    const { latest } = arena();
    const before = latest().turn;

    fireEvent.click(retirePile());
    fireEvent.mouseEnter(viewerRow('Applejack'));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyDown(window, { key: 'd' });

    expect(latest().turn).toBe(before);
    expect(latest().zones.hand).toHaveLength(0);
  });

  it('keeps the keyboard off the hidden piles, whose cards move by tutoring', () => {
    // Pulling from the Library has to reshuffle what browsing it exposed, which
    // is what the row's own "To hand" button does and a raw `h` would not.
    const { latest } = arena();

    // The Library pile has no click-to-open: browsing it lives in its menu.
    fireEvent.contextMenu(libraryPile());
    fireEvent.click(screen.getByText('View'));
    fireEvent.mouseEnter(viewerRow('Rarity'));
    fireEvent.keyDown(window, { key: 'h' });

    expect(latest().zones.library).toHaveLength(1);
    expect(latest().zones.hand).toHaveLength(0);
  });
});

describe('BoardArena, the table itself', () => {
  it('deals the deck onto the board on mount', () => {
    const onState = vi.fn();
    render(<BoardArena deck={deck} scale={1} onState={onState} />);

    const state = onState.mock.lastCall?.[0] as GameState;

    // One card in the deck, so it is the whole opening hand.
    expect(state.zones.hand).toHaveLength(1);
    expect(state.started).toBe(false);
  });

  it('flags what an incomplete deck is missing rather than refusing it', () => {
    // The deck endpoint deliberately does not refuse an incomplete deck, so
    // deciding what one means is the table's job.
    render(<BoardArena deck={deck} scale={1} />);

    const notice = screen.getByText(/Incomplete deck/);

    expect(notice).toHaveTextContent('no Main Character');
    expect(notice).toHaveTextContent('Main Deck under 50');
    expect(notice).toHaveTextContent('Scene Deck under 15');
  });

  it('lets the notice be dismissed, since the board is still playable', () => {
    render(<BoardArena deck={deck} scale={1} />);

    fireEvent.click(screen.getByText('Dismiss'));

    expect(screen.queryByText(/Incomplete deck/)).not.toBeInTheDocument();
  });

  it('deals the Plans on Start Game', () => {
    const onState = vi.fn();
    render(<BoardArena deck={deck} scale={1} onState={onState} />);

    fireEvent.click(screen.getByText('Start Game'));

    expect((onState.mock.lastCall?.[0] as GameState).started).toBe(true);
  });

  it('takes a turn on space, now that nothing shares the cursor', () => {
    const { latest } = arena();
    const before = latest().turn;

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    expect(latest().turn).toBe(before + 1);
  });
});
