import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchFormat, Seat, WinReason } from '@/types/game';
import { GameFinishedPayload } from '../sync/types';
import GameFinishedModal, { opponentsResult } from './GameFinishedModal';

const result = (
  winner: Seat,
  reason: WinReason,
  over: Partial<GameFinishedPayload> = {}
): GameFinishedPayload => ({
  status: 'finished',
  game_results: [{ game: 1, winner, reason }],
  winner_seat: winner,
  ...over,
});

function modal(seat: Seat, payload: GameFinishedPayload, format: MatchFormat = 'bo1') {
  render(
    <GameFinishedModal
      seat={seat}
      opponentName="Rarity"
      format={format}
      result={payload}
      onClose={vi.fn()}
    />
  );
}

describe('opponentsResult', () => {
  it('picks out what the other seat did', () => {
    expect(opponentsResult('host', result('host', 'concede'))).not.toBeNull();
    expect(opponentsResult('host', result('guest', 'story'))).not.toBeNull();
  });

  it('ignores what this seat did itself', () => {
    expect(opponentsResult('host', result('guest', 'concede'))).toBeNull();
    expect(opponentsResult('host', result('host', 'story'))).toBeNull();
  });
});

describe('GameFinishedModal', () => {
  it('tells you the opponent conceded a Bo1', () => {
    modal('host', result('host', 'concede'));

    expect(screen.getByRole('heading')).toHaveTextContent('Rarity conceded');
    expect(screen.getByText('You win the game.')).toBeInTheDocument();
  });

  it('names the game when a Bo3 goes on', () => {
    modal('guest', result('guest', 'concede', { status: 'active', winner_seat: null }), 'bo3');

    expect(screen.getByText('You win game 1.')).toBeInTheDocument();
  });

  it('tells you the opponent claimed the match', () => {
    modal('host', result('guest', 'story'), 'bo3');

    expect(screen.getByRole('heading')).toHaveTextContent('Rarity claimed the win');
    expect(screen.getByText(/They take the match\./)).toBeInTheDocument();
  });

  it('shows nothing for your own concede', () => {
    modal('host', result('guest', 'concede'));

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
