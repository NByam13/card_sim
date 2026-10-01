import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Seat } from '@/types/game';
import { TurnOrder } from '../sync/types';
import TurnOrderModal, { DECIDED_HOLD_MS, ROLL_REVEAL_MS } from './TurnOrderModal';

const names: Record<Seat, string> = { host: 'Twilight', guest: 'Rarity' };

const unrolled: TurnOrder = { roll: null, first_player: null };

const rolled = (): TurnOrder => ({
  roll: { host: [6, 5], guest: [2, 1], winner: 'host', rerolls: 1 },
  first_player: null,
});

function modal(turnOrder: TurnOrder, seat: Seat = 'host') {
  const props = {
    seat,
    names,
    opponentPresent: true,
    onRoll: vi.fn(),
    onElect: vi.fn(),
    onDone: vi.fn(),
  };
  const view = render(<TurnOrderModal {...props} turnOrder={turnOrder} />);
  const rerender = (next: TurnOrder) =>
    view.rerender(<TurnOrderModal {...props} turnOrder={next} />);

  return { ...props, rerender };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TurnOrderModal', () => {
  it('asks for the roll before there is one', () => {
    const { onRoll } = modal(unrolled);

    fireEvent.click(screen.getByRole('button', { name: 'Roll the dice' }));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Rolling…' })).toBeDisabled();
  });

  it('shows a roll already on the page settled, for a seat that reloads mid-election', () => {
    const { onElect } = modal(rolled());

    expect(screen.getByLabelText('You rolled 11')).toBeInTheDocument();
    expect(screen.getByLabelText('Rarity rolled 3')).toBeInTheDocument();
    expect(screen.getByText('Won the roll')).toBeInTheDocument();
    expect(screen.getByText(/Tied 1 time before that/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Go second/ }));

    expect(onElect).toHaveBeenCalledWith('guest');
  });

  it('leaves the loser waiting on the winner, with nothing to press', () => {
    modal(rolled(), 'guest');

    expect(
      screen.getByText('Twilight won the roll and is choosing who goes first')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tumbles a roll that arrives live before it lands, and only once', () => {
    const { rerender } = modal(unrolled);

    rerender(rolled());

    expect(screen.getByText('Rolling…')).toBeInTheDocument();
    expect(screen.queryByLabelText('You rolled 11')).toBeNull();

    act(() => vi.advanceTimersByTime(ROLL_REVEAL_MS));

    expect(screen.getByLabelText('You rolled 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go first/ })).toBeInTheDocument();

    // The same roll again, as the broadcast after the response.
    rerender(rolled());

    expect(screen.queryByText('Rolling…')).toBeNull();
  });

  it('announces who goes first, then steps aside', () => {
    const { onDone } = modal({ ...rolled(), first_player: 'guest' });

    expect(screen.getByText('Rarity goes first')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DECIDED_HOLD_MS));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('marks an opponent presence has seen leave', () => {
    render(
      <TurnOrderModal
        seat="host"
        names={names}
        turnOrder={unrolled}
        opponentPresent={false}
        onRoll={vi.fn()}
        onElect={vi.fn()}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText('Away')).toBeInTheDocument();
  });
});
