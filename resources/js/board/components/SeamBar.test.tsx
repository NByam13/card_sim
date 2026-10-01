import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MatchFormat, Seat } from '@/types/game';
import { TurnCursor, TurnOrder } from '../sync/types';
import SeamBar from './SeamBar';
import { MatchScore } from './WinClaimModal';

const names: Record<Seat, string> = { host: 'Twilight', guest: 'Rarity' };

const cursor = (over: Partial<TurnCursor> = {}): TurnCursor => ({
  turn_number: 0,
  active_seat: null,
  turn_stop: null,
  my_turn: false,
  ...over,
});

const rolled: TurnOrder = {
  roll: { host: [6, 5], guest: [2, 1], winner: 'host', rerolls: 0 },
  first_player: null,
};

const decided: TurnOrder = { ...rolled, first_player: 'guest' };

describe('SeamBar', () => {
  describe('before turn order is decided', () => {
    it.each([
      ['before the roll', { roll: null, first_player: null }],
      ['during the election', rolled],
    ])('rests with nothing to press %s', (_, turnOrder: TurnOrder) => {
      render(<SeamBar seat="host" names={names} cursor={cursor()} turnOrder={turnOrder} />);

      expect(screen.getByText('Deciding who goes first…')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('mid-turn', () => {
    const midTurn = cursor({
      turn_number: 3,
      active_seat: 'guest',
      turn_stop: 'contact:1',
      my_turn: true,
    });

    it('shows the turn, whose it is and the stop, and advances when it is yours', async () => {
      const onAdvance = vi.fn();
      render(
        <SeamBar
          seat="guest"
          names={names}
          cursor={midTurn}
          turnOrder={decided}
          onAdvance={onAdvance}
        />
      );

      expect(screen.getByText('Turn 3 · You')).toBeTruthy();
      const stops = within(screen.getByRole('list', { name: 'Turn stops' }));
      expect(stops.getByText('Lane 1').getAttribute('aria-current')).toBe('step');

      await userEvent.click(screen.getByRole('button', { name: 'Lane 2' }));

      expect(onAdvance).toHaveBeenCalledOnce();
    });

    it('offers the win claim on either seat’s turn', async () => {
      const onClaimWin = vi.fn();
      render(
        <SeamBar
          seat="host"
          names={names}
          cursor={{ ...midTurn, my_turn: false }}
          turnOrder={decided}
          onClaimWin={onClaimWin}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Claim win' }));

      expect(onClaimWin).toHaveBeenCalledOnce();
    });

    it('names the acting seat and offers nothing when it is not yours', () => {
      render(
        <SeamBar
          seat="host"
          names={names}
          cursor={{ ...midTurn, my_turn: false }}
          turnOrder={decided}
          onAdvance={vi.fn()}
        />
      );

      expect(screen.getByText('Turn 3 · Rarity')).toBeTruthy();
      expect(screen.getByText('Lane 1').getAttribute('aria-current')).toBe('step');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('shows a watcher the same turn', () => {
      render(
        <SeamBar
          seat={null}
          names={names}
          cursor={{ ...midTurn, my_turn: false }}
          turnOrder={decided}
        />
      );

      expect(screen.getByText('Turn 3 · Rarity')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('hands the first player the opening press before turn 1', () => {
      render(
        <SeamBar
          seat="guest"
          names={names}
          cursor={cursor({ my_turn: true })}
          turnOrder={decided}
          onAdvance={vi.fn()}
        />
      );

      expect(screen.getByText('Turn 1 · You')).toBeTruthy();
      expect(screen.getByText('Start').getAttribute('aria-current')).toBe('step');
      expect(screen.getByRole('button', { name: 'Start turn' })).toBeTruthy();
    });

    it('says what the opening press is waiting on instead of offering it', () => {
      render(
        <SeamBar
          seat="guest"
          names={names}
          cursor={cursor({ my_turn: true })}
          turnOrder={decided}
          waiting="Waiting for opponent"
        />
      );

      expect(screen.getByText('Waiting for opponent')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('presence', () => {
    it.each([
      ['before the roll', { roll: null, first_player: null }],
      ['during the election', rolled],
      ['mid-turn', decided],
    ])('marks an away seat against its name %s', (_, turnOrder: TurnOrder) => {
      render(
        <SeamBar
          seat="host"
          names={names}
          cursor={cursor()}
          turnOrder={turnOrder}
          away={['guest']}
        />
      );

      const bar = screen.getByRole('region', { name: 'Turn' });
      expect(within(bar).getByText('Away').previousSibling?.textContent).toBe('Rarity');
    });

    it('marks no one away while everyone is here', () => {
      render(<SeamBar seat="host" names={names} cursor={cursor()} turnOrder={decided} />);

      expect(screen.queryByText('Away')).toBeNull();
    });

    it('marks every seat that is gone, for a watcher', () => {
      render(
        <SeamBar
          seat={null}
          names={names}
          cursor={cursor()}
          turnOrder={decided}
          away={['host', 'guest']}
        />
      );

      expect(screen.getAllByText('Away')).toHaveLength(2);
      expect(screen.getByText('Twilight')).toBeTruthy();
    });
  });

  describe('the score', () => {
    const bo3: MatchScore = {
      format: MatchFormat.Bo3,
      game_number: 2,
      games_to_win: 2,
      wins: { host: 1, guest: 0 },
    };

    it.each([
      ['before the roll', { roll: null, first_player: null }],
      ['mid-turn', decided],
    ])('shows a Bo3 from your side of the table %s', (_, turnOrder: TurnOrder) => {
      render(
        <SeamBar seat="guest" names={names} cursor={cursor()} turnOrder={turnOrder} score={bo3} />
      );

      const score = screen.getByLabelText('Score');
      expect(score.textContent).toBe('You0–1TwilightFirst to 2');
    });

    it('shows a watcher the host first', () => {
      render(
        <SeamBar seat={null} names={names} cursor={cursor()} turnOrder={decided} score={bo3} />
      );

      expect(screen.getByLabelText('Score').textContent).toBe('Twilight1–0RarityFirst to 2');
    });

    it('leaves a Bo1 without one', () => {
      render(
        <SeamBar
          seat="host"
          names={names}
          cursor={cursor()}
          turnOrder={decided}
          score={{ ...bo3, format: MatchFormat.Bo1, games_to_win: 1, wins: { host: 0, guest: 0 } }}
        />
      );

      expect(screen.queryByLabelText('Score')).toBeNull();
    });
  });
});
