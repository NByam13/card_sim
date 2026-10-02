import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Seat } from '@/types/game';
import MatchResultModal, { FinishedMatch, MatchOverBar, MatchSummary } from './MatchResult';

const names = { host: 'Twilight', guest: 'Rarity' };

const bo3: FinishedMatch = {
  format: 'bo3',
  game_number: 3,
  games_to_win: 2,
  wins: { host: 2, guest: 1 },
  winner_seat: 'host',
  game_results: [
    { game: 1, winner: 'host', reason: 'story' },
    { game: 2, winner: 'guest', reason: 'concede' },
    { game: 3, winner: 'host', reason: 'story' },
  ],
};

const bo1: FinishedMatch = {
  format: 'bo1',
  game_number: 1,
  games_to_win: 1,
  wins: { host: 0, guest: 1 },
  winner_seat: 'guest',
  game_results: [{ game: 1, winner: 'guest', reason: 'concede' }],
};

const noOne = { host: false, guest: false };

function modal(
  over: { seat?: Seat; match?: FinishedMatch; accepted?: Record<Seat, boolean> } = {}
) {
  const props = { onRematch: vi.fn(), onClose: vi.fn() };
  render(
    <MatchResultModal
      seat={over.seat ?? 'host'}
      names={names}
      match={over.match ?? bo3}
      accepted={over.accepted ?? noOne}
      {...props}
    />
  );
  return props;
}

describe('MatchSummary', () => {
  it('names the winner, the final score and how each game ended', () => {
    render(<MatchSummary seat="host" names={names} match={bo3} />);

    expect(screen.getByRole('heading')).toHaveTextContent('You won the match');
    expect(screen.getByLabelText('Final score')).toHaveTextContent('2–1');
    const games = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(games).toEqual([
      'Game 1: You reached Story Stage IV',
      'Game 2: You conceded',
      'Game 3: You reached Story Stage IV',
    ]);
  });

  it('reads from the losing seat as well', () => {
    render(<MatchSummary seat="guest" names={names} match={bo3} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Twilight won the match');
    expect(screen.getByLabelText('Final score')).toHaveTextContent('1–2');
  });

  it('names both seats for a watcher', () => {
    render(<MatchSummary seat={null} names={names} match={bo3} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Twilight won the match');
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Twilight conceded');
  });

  it('calls a Bo1 a game, with no score to keep', () => {
    render(<MatchSummary seat="host" names={names} match={bo1} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Rarity won the game');
    expect(screen.queryByLabelText('Final score')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('You conceded');
  });
});

describe('MatchResultModal', () => {
  it('offers a rematch', async () => {
    const { onRematch } = modal();

    await userEvent.click(screen.getByRole('button', { name: 'Rematch' }));

    expect(onRematch).toHaveBeenCalledOnce();
  });

  it('answers a rematch the opponent asked for', async () => {
    const { onRematch } = modal({ accepted: { host: false, guest: true } });

    expect(screen.getByText(/Rarity wants a rematch/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept the rematch' }));

    expect(onRematch).toHaveBeenCalledOnce();
  });

  it('waits on the opponent once this seat has asked', () => {
    modal({ accepted: { host: true, guest: false } });

    expect(screen.getByText(/to accept the rematch/)).toHaveTextContent(
      'Waiting for Rarity to accept the rematch'
    );
    expect(screen.queryByRole('button', { name: /rematch/i })).toBeNull();
  });

  it('closes to the board', async () => {
    const { onClose } = modal();

    await userEvent.click(screen.getByRole('button', { name: 'Look at the board' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('MatchOverBar', () => {
  it('keeps the result in a line and reopens it', async () => {
    const onResults = vi.fn();
    render(
      <MatchOverBar
        seat="guest"
        names={names}
        match={bo3}
        accepted={{ host: true, guest: false }}
        onResults={onResults}
      />
    );

    expect(screen.getByLabelText('Match over')).toHaveTextContent('Twilight won 1–2');
    expect(screen.getByText('Twilight wants a rematch')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Results & rematch' }));

    expect(onResults).toHaveBeenCalledOnce();
  });
});
