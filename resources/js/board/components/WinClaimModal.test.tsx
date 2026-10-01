import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Seat } from '@/types/game';
import WinClaimModal, { MatchScore } from './WinClaimModal';

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
    <WinClaimModal
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

describe('WinClaimModal', () => {
  it('congratulates and says a Bo1 claim ends the game', () => {
    modal(bo1);

    expect(screen.getByText('Stage IV!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'That wins you the game' })).toBeInTheDocument();
    expect(screen.getByText(/ends the game as a loss for Rarity/)).toBeInTheDocument();
    expect(screen.queryByText(/would stand at/)).toBeNull();
  });

  it('says the opening game of a Bo3 takes only that game, with the score it leaves', () => {
    modal(bo3(1, 0, 0));

    expect(screen.getByRole('heading', { name: 'That wins you game 1' })).toBeInTheDocument();
    expect(screen.getByText(/gives Rarity the loss for game 1/)).toBeInTheDocument();
    expect(screen.getByText('The match would stand at 1–0.')).toBeInTheDocument();
  });

  it('says a deciding Bo3 claim takes the match, counting from the claimant’s side', () => {
    modal(bo3(3, 1, 1), { seat: 'guest' });

    expect(screen.getByRole('heading', { name: 'That wins you the match' })).toBeInTheDocument();
    expect(screen.getByText('The match would stand at 2–1.')).toBeInTheDocument();
  });

  it('confirms the claim', async () => {
    const { onConfirm, onClose } = modal(bo1);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm the win' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses without claiming', async () => {
    const { onConfirm, onClose } = modal(bo1);

    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('holds both buttons while the claim is in flight', () => {
    modal(bo1, { busy: true });

    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeDisabled();
  });

  it('says so when the claim was refused', () => {
    modal(bo1, { error: 'The win could not be recorded.' });

    expect(screen.getByRole('alert')).toHaveTextContent('The win could not be recorded.');
  });
});
