import { Card } from '@/types/cards';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, Mock, vi } from 'vitest';
import { BoardDispatchProvider, BoardTokensProvider } from '../context';
import { CardInstance, ZoneId } from '../types';
import { Action } from '../useGame';
import CardContextMenu from './CardContextMenu';

/** Ported from PonyRec's `CardContextMenu.test.tsx`, less its View card row. */

const instance: CardInstance = {
  uid: 'card-1',
  card: { card_number: 'BP01-C01', name: 'Test Card', subtype: 'character' } as Card,
  tapped: false,
  faceDown: false,
  counters: 0,
  inspiration: null,
};

const CANDY = { card_number: 'TK01', name: 'Candy', subtype: 'token' } as Card;
const PRESENT = { card_number: 'TK02', name: "Twilight's Present", subtype: 'token' } as Card;

const tokenInstance: CardInstance = { ...instance, uid: 'token-1', card: CANDY };
const itemInstance: CardInstance = {
  ...instance,
  uid: 'item-1',
  card: { card_number: 'BP01-I01', name: 'Test Item', subtype: 'item' } as Card,
};

function menu(
  zone: ZoneId,
  { tokens = [], on = instance, dispatch = vi.fn<(action: Action) => void>() }: MenuOptions = {}
) {
  render(
    <BoardDispatchProvider value={dispatch}>
      <BoardTokensProvider value={tokens}>
        <CardContextMenu instance={on} zone={zone} x={0} y={0} onClose={() => {}} />
      </BoardTokensProvider>
    </BoardDispatchProvider>
  );
  return dispatch;
}

interface MenuOptions {
  /** The tokens this deck can spawn (`Deck.tokens`). */
  tokens?: Card[];
  /** The card the menu was opened on. Defaults to an ordinary Character. */
  on?: CardInstance;
  dispatch?: Mock<(action: Action) => void>;
}

/** The row's whole button, so its keyboard hint chip comes with it. */
function row(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

describe('CardContextMenu', () => {
  it('hints r on Retire for a card in an Adventure lane', () => {
    menu('adventureC');
    expect(row('Retire')).toHaveTextContent('r');
  });

  it('offers no Reveal in a lane, where the card is already public', () => {
    menu('adventureC');
    expect(screen.queryByText('Reveal')).not.toBeInTheDocument();
  });

  it('leaves Retire unhinted on a Story stage, where r still reveals', () => {
    menu('storyII');
    expect(row('Retire')).toHaveTextContent('Retire');
    expect(row('Retire').querySelector('kbd')).toBeNull();
    expect(screen.queryByText('Reveal')).not.toBeInTheDocument();
  });

  it('offers a card in the Retire pile nothing but somewhere to go', () => {
    // It is out of play. Tapping it, turning it face down or counting it means
    // nothing, and offering those reads like the card is still on the board.
    menu('retire');

    expect(screen.getByText('To hand')).toBeInTheDocument();
    expect(screen.getByText('Send to top of deck')).toBeInTheDocument();
    expect(screen.getByText('Send to bottom of deck')).toBeInTheDocument();

    expect(screen.queryByText('Tap')).not.toBeInTheDocument();
    expect(screen.queryByText('Turn face-down')).not.toBeInTheDocument();
    expect(screen.queryByText('Add counter')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset counters')).not.toBeInTheDocument();
    expect(screen.queryByText('Set inspiration…')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset inspiration')).not.toBeInTheDocument();
  });

  it('keeps offering the in-play rows everywhere else', () => {
    menu('adventureC');

    expect(screen.getByText('Tap')).toBeInTheDocument();
    expect(screen.getByText('Add counter')).toBeInTheDocument();
    expect(screen.getByText('Reset inspiration')).toBeInTheDocument();
  });

  it('offers no token row for a deck that references none', () => {
    menu('adventureC');
    expect(screen.queryByText('Add token')).not.toBeInTheDocument();
  });

  it('offers no token row on an Item sharing the lane', () => {
    // Tokens go onto Characters. Dragging one onto an Item is still allowed;
    // offering it here would read as if the Item could be given Candy.
    menu('adventureC', { tokens: [CANDY], on: itemInstance });
    expect(screen.queryByText('Add token')).not.toBeInTheDocument();
  });

  it('offers no token row outside an Adventure lane', () => {
    // Nothing in BP03/BP04 places a token anywhere but the Adventure Area.
    menu('scene', { tokens: [CANDY] });
    expect(screen.queryByText('Add token')).not.toBeInTheDocument();
  });

  it('spawns the chosen token into the lane the card sits in', () => {
    const dispatch = menu('adventureR', { tokens: [CANDY, PRESENT] });

    // The list is collapsed until asked for, so a 7-token deck does not bury
    // the rest of the menu.
    expect(screen.queryByText('Candy')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add token'));

    expect(screen.getByText("Twilight's Present")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Candy'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SPAWN_TOKEN',
      card: CANDY,
      toZone: 'adventureR',
    });
  });

  it('offers a token nothing but removing it', () => {
    // A token is never tapped or turned face down, has no printed Inspiration and
    // carries no counters, and was never in a deck it could go back to.
    const dispatch = menu('adventureC', { tokens: [CANDY], on: tokenInstance });

    expect(row('Remove token')).toHaveTextContent('r');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.click(screen.getByText('Remove token'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_CARD', uid: 'token-1' });
  });

  it('keeps the r hint on Reveal for a hand card', () => {
    menu('hand');
    expect(row('Reveal')).toHaveTextContent('r');
    // A hand card discards rather than retires, and that row has no binding.
    expect(row('Discard').querySelector('kbd')).toBeNull();
  });
});
