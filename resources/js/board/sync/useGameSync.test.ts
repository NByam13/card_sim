import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Seat } from '@/types/game';
import { PublicState, StateFrame } from './types';
import { listenForTurns, postJson, useGameSync } from './useGameSync';

const request = vi.hoisted(() => vi.fn());

vi.mock('@inertiajs/react', () => ({ http: { getClient: () => ({ request }) } }));

vi.mock('@laravel/echo-react', () => ({
  useEchoPresence: () => ({ channel: () => presence }),
}));

interface Member {
  id: string;
  role: Seat | 'spectator';
  name: string | null;
}

/**
 * A stand-in for the presence channel, holding whatever the hook bound so a test
 * can drive it. Chainable, like Echo's own.
 */
function fakeChannel() {
  const bound: {
    here?: (members: Member[]) => void;
    joining?: (member: Member) => void;
    leaving?: (member: Member) => void;
    events: Record<string, (payload: unknown) => void>;
  } = { events: {} };

  const channel = {
    bound,
    here(handler: (members: Member[]) => void) {
      bound.here = handler;
      return channel;
    },
    joining(handler: (member: Member) => void) {
      bound.joining = handler;
      return channel;
    },
    leaving(handler: (member: Member) => void) {
      bound.leaving = handler;
      return channel;
    },
    listen(event: string, handler: (payload: unknown) => void) {
      bound.events[event] = handler;
      return channel;
    },
    // Never called, and a test says so. See the client-event note on the hook.
    listenForWhisper: vi.fn(() => channel),
    error() {
      return channel;
    },
  };

  return channel;
}

let presence: ReturnType<typeof fakeChannel>;

const member = (role: Member['role'], id: string = role): Member => ({ id, role, name: null });

const frame = (seat: Seat, seq = 1): StateFrame & { seat: Seat } => ({
  seat,
  game_number: 1,
  session: 's1',
  seq,
  state: { zones: {}, counts: {}, turn: 1, started: true } as unknown as PublicState,
});

function sync(seat: Seat = 'host') {
  const onFrame = vi.fn();
  const onAnnounce = vi.fn();
  const onSeatClaimed = vi.fn();
  const onAccepted = vi.fn();
  const onTurnAdvanced = vi.fn();
  const onTurnOrderRolled = vi.fn();
  const onTurnOrderDecided = vi.fn();
  const onGameFinished = vi.fn();
  const view = renderHook(() =>
    useGameSync({
      code: 'abc123',
      seat,
      onFrame,
      onAnnounce,
      onSeatClaimed,
      onAccepted,
      onTurnAdvanced,
      onTurnOrderRolled,
      onTurnOrderDecided,
      onGameFinished,
    })
  );

  return {
    ...view,
    onFrame,
    onAnnounce,
    onSeatClaimed,
    onAccepted,
    onTurnAdvanced,
    onTurnOrderRolled,
    onTurnOrderDecided,
    onGameFinished,
  };
}

beforeEach(() => {
  presence = fakeChannel();
});

describe('useGameSync', () => {
  it('reports the opponent as present when they are already here', () => {
    const { result } = sync('host');

    act(() => presence.bound.here?.([member('host'), member('guest')]));

    expect(result.current.opponentPresent).toBe(true);
  });

  it('does not mistake your own seat for the opponent', () => {
    const { result } = sync('host');

    act(() => presence.bound.here?.([member('host')]));

    expect(result.current.opponentPresent).toBe(false);
  });

  it('counts watchers without calling them the opponent', () => {
    const { result } = sync('host');

    act(() =>
      presence.bound.here?.([member('host'), member('spectator', 'w1'), member('spectator', 'w2')])
    );

    expect(result.current.opponentPresent).toBe(false);
    expect(result.current.watching).toBe(2);
  });

  it('follows the opponent arriving and leaving', () => {
    const { result } = sync('host');

    act(() => presence.bound.here?.([member('host')]));
    act(() => presence.bound.joining?.(member('guest')));
    expect(result.current.opponentPresent).toBe(true);

    act(() => presence.bound.leaving?.(member('guest')));
    expect(result.current.opponentPresent).toBe(false);
  });

  it('does not call the opponent gone before presence has answered', () => {
    const { result } = sync('host');

    expect(result.current.opponentPresent).toBeNull();
  });

  it('clears the opponent being gone when they come back', () => {
    const { result } = sync('host');

    act(() => presence.bound.here?.([member('host'), member('guest')]));
    act(() => presence.bound.leaving?.(member('guest')));
    act(() => presence.bound.joining?.(member('guest')));

    expect(result.current.opponentPresent).toBe(true);
  });

  it('follows watchers arriving and leaving', () => {
    const { result } = sync('host');

    act(() => presence.bound.here?.([member('host')]));
    act(() => presence.bound.joining?.(member('spectator', 'w1')));
    act(() => presence.bound.joining?.(member('spectator', 'w2')));
    expect(result.current.watching).toBe(2);

    act(() => presence.bound.leaving?.(member('spectator', 'w1')));
    expect(result.current.watching).toBe(1);
  });

  /** Whoever just arrived has no board, so everyone already here re-sends one. */
  it('announces on subscribing and whenever anyone joins', () => {
    const { onAnnounce } = sync('host');

    act(() => presence.bound.here?.([member('host')]));
    expect(onAnnounce).toHaveBeenCalledTimes(1);

    act(() => presence.bound.joining?.(member('guest')));
    expect(onAnnounce).toHaveBeenCalledTimes(2);

    act(() => presence.bound.joining?.(member('spectator', 'w1')));
    expect(onAnnounce).toHaveBeenCalledTimes(3);
  });

  it('hands over the opponent’s frame without the seat it was stamped with', () => {
    const { onFrame } = sync('host');

    act(() => presence.bound.events['.board.state']?.(frame('guest', 4)));

    expect(onFrame).toHaveBeenCalledWith({
      game_number: 1,
      session: 's1',
      seq: 4,
      state: expect.anything(),
    });
    expect(onFrame.mock.calls[0][0]).not.toHaveProperty('seat');
  });

  /**
   * The relay is `toOthers`, so this should not arrive at all — but a frame
   * stamped with your own seat would overwrite the mirror with your own board.
   */
  it('ignores a frame stamped with its own seat', () => {
    const { onFrame } = sync('host');

    act(() => presence.bound.events['.board.state']?.(frame('host')));

    expect(onFrame).not.toHaveBeenCalled();
  });

  it('hands over the cursor from a turn advancing', () => {
    const { onTurnAdvanced } = sync('host');
    const cursor = { turn_number: 2, active_seat: 'guest', turn_stop: null };

    act(() => presence.bound.events['.turn.advanced']?.({ cursor }));

    expect(onTurnAdvanced).toHaveBeenCalledWith(cursor);
  });

  it('hands over the roll and the election, including its own', () => {
    const { onTurnOrderRolled, onTurnOrderDecided } = sync('host');
    const roll = { host: [6, 5], guest: [2, 1], winner: 'host', rerolls: 0 };

    act(() => presence.bound.events['.turn_order.rolled']?.({ roll }));
    act(() =>
      presence.bound.events['.turn_order.decided']?.({ first_player: 'guest', game_number: 2 })
    );

    expect(onTurnOrderRolled).toHaveBeenCalledWith(roll);
    expect(onTurnOrderDecided).toHaveBeenCalledWith('guest', 2);
  });

  /**
   * Reverb cannot say who sent a client event and accepts them from connections
   * that never subscribed. Not listening is what makes an injected one inert.
   */
  it('never listens for client events', () => {
    sync('host');

    expect(presence.listenForWhisper).not.toHaveBeenCalled();
    expect(Object.keys(presence.bound.events)).toEqual([
      '.board.state',
      '.seat.claimed',
      '.match.accepted',
      '.game.finished',
      '.turn.advanced',
      '.turn_order.rolled',
      '.turn_order.decided',
    ]);
  });

  it('reports a seat claimed while the board is on screen', () => {
    const { onSeatClaimed } = sync('host');

    act(() => presence.bound.events['.seat.claimed']?.({}));

    expect(onSeatClaimed).toHaveBeenCalledTimes(1);
  });

  it('passes on both seats’ answers when one accepts, not just the sender’s', () => {
    const { onAccepted } = sync('host');

    act(() =>
      presence.bound.events['.match.accepted']?.({
        seat: 'guest',
        accepted: { host: false, guest: true },
      })
    );

    expect(onAccepted).toHaveBeenCalledWith({ host: false, guest: true });
  });

  it('passes a recorded game on whole', () => {
    const { onGameFinished } = sync('host');
    const result = {
      status: 'active',
      game_results: [{ game: 1, winner: 'host', reason: 'concede' }],
      winner_seat: null,
    };

    act(() => presence.bound.events['.game.finished']?.(result));

    expect(onGameFinished).toHaveBeenCalledWith(result);
  });
});

describe('postJson', () => {
  it('parses a JSON body that arrives as a string', async () => {
    request.mockResolvedValueOnce({ data: '{"cursor":{"turn_number":2}}' });

    await expect(postJson('/x', {})).resolves.toEqual({ cursor: { turn_number: 2 } });
  });

  it('resolves an empty body to nothing rather than failing the request', async () => {
    request.mockResolvedValueOnce({ data: '' });

    await expect(postJson('/x', {})).resolves.toBeUndefined();
  });
});

describe('listenForTurns', () => {
  it('unwraps each turn event for its listener', () => {
    const listeners = {
      onTurnAdvanced: vi.fn(),
      onTurnOrderRolled: vi.fn(),
      onTurnOrderDecided: vi.fn(),
    };
    const cursor = { turn_number: 2, active_seat: 'guest', turn_stop: null };
    const roll = { host: [6, 5], guest: [2, 1], winner: 'host', rerolls: 0 };

    listenForTurns(presence, listeners);
    presence.bound.events['.turn.advanced']?.({ cursor });
    presence.bound.events['.turn_order.rolled']?.({ roll });
    presence.bound.events['.turn_order.decided']?.({ first_player: 'guest', game_number: 2 });

    expect(listeners.onTurnAdvanced).toHaveBeenCalledWith(cursor);
    expect(listeners.onTurnOrderRolled).toHaveBeenCalledWith(roll);
    expect(listeners.onTurnOrderDecided).toHaveBeenCalledWith('guest', 2);
  });
});
