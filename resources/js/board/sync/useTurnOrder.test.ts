import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnOrder, TurnOrderRoll } from './types';
import { useTurnOrder } from './useTurnOrder';

vi.mock('./useGameSync', () => ({ postJson: vi.fn() }));
vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }));

const { postJson } = await import('./useGameSync');
const { router } = await import('@inertiajs/react');
const posted = vi.mocked(postJson);

const undecided: TurnOrder = { roll: null, first_player: null };

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
    posted.mockResolvedValueOnce({ roll: roll() });
    const { result } = mount();

    await act(async () => result.current.roll());

    expect(posted).toHaveBeenCalledWith('/games/abc123/turn-order/roll', {});
    expect(result.current.turnOrder.roll).toEqual(roll());
  });

  it('treats the broadcast of its own roll as the same result', async () => {
    posted.mockResolvedValueOnce({ roll: roll() });
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
    posted.mockResolvedValueOnce({ first_player: 'guest' });
    const { result } = mount({ roll: roll(), first_player: null });

    await act(async () => result.current.elect('guest'));
    act(() => result.current.receiveDecided('guest'));

    expect(posted).toHaveBeenCalledWith('/games/abc123/turn-order/elect', {
      first_player: 'guest',
    });
    expect(result.current.turnOrder.first_player).toBe('guest');
    expect(router.reload).toHaveBeenCalledOnce();
    expect(router.reload).toHaveBeenCalledWith({ only: ['cursor'] });
  });

  it('reloads the cursor when the other seat elects', () => {
    const { result } = mount({ roll: roll(), first_player: null });

    act(() => result.current.receiveDecided('host'));

    expect(router.reload).toHaveBeenCalledWith({ only: ['cursor'] });
  });

  it('reloads turn order when a request is refused', async () => {
    posted.mockRejectedValueOnce(new Error('403'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount({ roll: roll(), first_player: null });

    await act(async () => result.current.elect('host'));

    expect(router.reload).toHaveBeenCalledWith({ only: ['turnOrder', 'cursor'] });
  });
});
