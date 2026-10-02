import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnOrder, TurnOrderRoll } from './types';
import { useTurnOrder } from './useTurnOrder';

vi.mock('./useGameSync', () => ({ postJson: vi.fn() }));
vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }));

const { postJson } = await import('./useGameSync');
const { router } = await import('@inertiajs/react');
const posted = vi.mocked(postJson);

const undecided: TurnOrder = { game_number: 1, roll: null, first_player: null, chooser: null };

const roll = (over: Partial<TurnOrderRoll> = {}): TurnOrderRoll => ({
  host: [6, 5],
  guest: [2, 1],
  winner: 'host',
  rerolls: 0,
  ...over,
});

const mount = (turnOrder = undecided) =>
  renderHook(({ turnOrder }) => useTurnOrder({ code: 'abc123', turnOrder }), {
    initialProps: { turnOrder },
  });

beforeEach(() => vi.clearAllMocks());

describe('useTurnOrder', () => {
  it('rolls and takes the roll the server answers with', async () => {
    posted.mockResolvedValueOnce({ game_number: 1, roll: roll() });
    const { result } = mount();

    await act(async () => result.current.roll());

    expect(posted).toHaveBeenCalledWith('/games/abc123/turn-order/roll', {});
    expect(result.current.turnOrder.roll).toEqual(roll());
  });

  it('treats the broadcast of its own roll as the same result', async () => {
    posted.mockResolvedValueOnce({ game_number: 1, roll: roll() });
    const { result } = mount();

    await act(async () => result.current.roll());
    const applied = result.current.turnOrder;
    act(() => result.current.receiveRoll(roll()));

    expect(result.current.turnOrder).toBe(applied);
  });

  it('takes a roll from the channel', () => {
    const { result } = mount();

    act(() => result.current.receiveRoll(roll({ winner: 'guest', host: [1, 1], guest: [3, 3] })));

    expect(result.current.turnOrder.roll?.winner).toBe('guest');
  });

  it('elects, then reloads the cursor once however many times the decision arrives', async () => {
    posted.mockResolvedValueOnce({ first_player: 'guest', game_number: 1 });
    const { result } = mount({ game_number: 1, roll: roll(), first_player: null, chooser: 'host' });

    await act(async () => result.current.elect('guest'));
    act(() => result.current.receiveDecided('guest', 1));

    expect(posted).toHaveBeenCalledWith('/games/abc123/turn-order/elect', {
      first_player: 'guest',
    });
    expect(result.current.turnOrder.first_player).toBe('guest');
    expect(router.reload).toHaveBeenCalledOnce();
    expect(router.reload).toHaveBeenCalledWith({ only: ['cursor'] });
  });

  it('reloads the cursor when the other seat elects', () => {
    const { result } = mount({ game_number: 1, roll: roll(), first_player: null, chooser: 'host' });

    act(() => result.current.receiveDecided('host', 1));

    expect(router.reload).toHaveBeenCalledWith({ only: ['cursor'] });
  });

  it('reloads turn order when a request is refused', async () => {
    posted.mockRejectedValueOnce(new Error('403'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount({ game_number: 1, roll: roll(), first_player: null, chooser: 'host' });

    await act(async () => result.current.elect('host'));

    expect(router.reload).toHaveBeenCalledWith({ only: ['turnOrder', 'cursor'] });
  });

  describe('across games of a Bo3', () => {
    const gameOneDecided: TurnOrder = {
      game_number: 1,
      roll: roll(),
      first_player: 'host',
      chooser: 'host',
    };
    const gameTwoUndecided: TurnOrder = {
      game_number: 2,
      roll: null,
      first_player: null,
      chooser: 'guest',
    };

    it("takes game 2's decision even when it names the same first player as game 1", () => {
      const { result } = mount(gameOneDecided);

      act(() => result.current.receiveDecided('host', 2));

      expect(result.current.turnOrder).toMatchObject({ game_number: 2, first_player: 'host' });
      expect(router.reload).toHaveBeenCalledWith({ only: ['turnOrder', 'cursor'] });
    });

    it('keeps a decision when a reload answered before it lands afterwards', () => {
      const { result, rerender } = mount(gameOneDecided);

      act(() => result.current.receiveDecided('host', 2));
      rerender({ turnOrder: gameTwoUndecided });

      expect(result.current.turnOrder).toEqual({ ...gameTwoUndecided, first_player: 'host' });
    });

    it('ignores a decision from an earlier game', () => {
      const { result } = mount(gameTwoUndecided);

      act(() => result.current.receiveDecided('host', 1));

      expect(result.current.turnOrder).toEqual(gameTwoUndecided);
      expect(router.reload).not.toHaveBeenCalled();
    });

    it('ignores a reload from an earlier game', () => {
      const { result, rerender } = mount(gameTwoUndecided);

      rerender({ turnOrder: gameOneDecided });

      expect(result.current.turnOrder).toEqual(gameTwoUndecided);
    });

    it('takes a reload into the next game whole', () => {
      const { result, rerender } = mount(gameOneDecided);

      rerender({ turnOrder: gameTwoUndecided });

      expect(result.current.turnOrder).toEqual(gameTwoUndecided);
    });

    it('ignores a roll once past game 1', () => {
      const { result } = mount(gameTwoUndecided);

      act(() => result.current.receiveRoll(roll()));

      expect(result.current.turnOrder.roll).toBeNull();
    });
  });
});
