import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Seat } from '@/types/game';
import ConcedeModal from './ConcedeModal';
import { MatchScore } from './WinClaimModal';

const bo1: MatchScore = {
  format: 'bo1',
  game_number: 1,
  games_to_win: 1,
  wins: { host: 0, guest: 0 },
};
const bo3 = (game_number: number, host: number, guest: number): MatchScore => ({
  format: 'bo3',
  game_number,
  games_to_win: 2,
  wins: { host, guest },
});

function modal(
  score: MatchScore,
  over: { seat?: Seat; busy?: boolean; error?: string | null } = {}
) {
  const props = { onConfirm: vi.fn(), onClose: vi.fn() };
  render(
    <ConcedeModal
      seat={over.seat ?? 'host'}
      opponentName="Rarity"
      score={score}
      busy={over.busy ?? false}
      error={over.error ?? null}
      {...props}
    />
  );
  return props;
}

describe('ConcedeModal', () => {
  it('says a Bo1 concede records the opponent as the winner', () => {
    modal(bo1);

    expect(screen.getByRole('heading')).toHaveTextContent('Concede the game?');
    expect(screen.getByText('Rarity is recorded as the winner.')).toBeInTheDocument();
    expect(screen.queryByText(/would stand at/)).not.toBeInTheDocument();
  });

  it('says an opening Bo3 concede gives up the game, not the match', () => {
    modal(bo3(1, 0, 0));

    expect(screen.getByRole('heading')).toHaveTextContent('Concede game 1?');
    expect(screen.getByText('Rarity takes game 1. The match goes on.')).toBeInTheDocument();
    expect(screen.getByText('The match would stand at 0–1.')).toBeInTheDocument();
  });

  it('says conceding the deciding game gives up the match', () => {
    modal(bo3(3, 1, 1), { seat: 'guest' });

    expect(screen.getByText('Rarity takes the game and the match.')).toBeInTheDocument();
    expect(screen.getByText('The match would stand at 1–2.')).toBeInTheDocument();
  });

  it('concedes only on the confirm button', async () => {
    const { onConfirm, onClose } = modal(bo1);

    await userEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Concede' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('holds both buttons while the concede is in flight, and shows a failure', () => {
    modal(bo1, { busy: true, error: 'The concede could not be recorded.' });

    expect(screen.getByRole('button', { name: 'Conceding…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep playing' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('The concede could not be recorded.');
  });
});
