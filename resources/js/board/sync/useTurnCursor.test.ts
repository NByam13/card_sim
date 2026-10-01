import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnCursor, WireCursor } from './types';
import { useTurnCursor } from './useTurnCursor';

vi.mock('./useGameSync', () => ({ postJson: vi.fn() }));
vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }));

const { postJson } = await import('./useGameSync');
const { router } = await import('@inertiajs/react');
const posted = vi.mocked(postJson);

const served = (over: Partial<TurnCursor> = {}): TurnCursor => ({
  turn_number: 3,
  active_seat: 'host',
  turn_stop: null,
  my_turn: true,
  ...over,
});

/** A response the test settles by hand, so a second press can land while it is in flight. */
function pending() {
  let settle!: (cursor: WireCursor) => void;
  let fail!: (error: unknown) => void;
  posted.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle = (cursor) => resolve({ cursor });
        fail = reject;
      })
  );

  return {
    settle: (cursor: WireCursor) => act(async () => settle(cursor)),
    fail: () => act(async () => fail(new Error('409'))),
  };
}

const mount = (cursor = served()) =>
  renderHook(({ cursor }) => useTurnCursor({ code: 'abc123', seat: 'host', cursor }), {
    initialProps: { cursor },
  });

beforeEach(() => vi.clearAllMocks());

describe('useTurnCursor', () => {
  it('posts the next stop and takes the cursor the server answers with', async () => {
    const { result } = mount(served({ turn_stop: 'main' }));
    const response = pending();

    act(() => result.current.advance(vi.fn()));
    await response.settle({ turn_number: 3, active_seat: 'host', turn_stop: 'contact:1' });

    expect(posted).toHaveBeenCalledWith('/games/abc123/cursor', { turn_stop: 'contact:1' });
    expect(result.current.cursor).toEqual(served({ turn_stop: 'contact:1' }));
  });

  it('drops a press while a move is in flight', async () => {
    const { result } = mount(served({ turn_stop: 'main' }));
    const response = pending();

    act(() => result.current.advance(vi.fn()));
    act(() => result.current.advance(vi.fn()));
    await response.settle({ turn_number: 3, active_seat: 'host', turn_stop: 'contact:1' });

    expect(posted).toHaveBeenCalledOnce();
  });

  it('starts the local turn only once the server accepts the move onto main', async () => {
    const { result } = mount();
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    expect(onTurnStart).not.toHaveBeenCalled();
    await response.settle({ turn_number: 3, active_seat: 'host', turn_stop: 'main' });

    expect(onTurnStart).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('starts turn 1 without a draw', async () => {
    const { result } = mount(served({ turn_number: 0, active_seat: null }));
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    await response.settle({ turn_number: 1, active_seat: 'host', turn_stop: 'main' });

    expect(onTurnStart).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('does not start the local turn for any other move', async () => {
    const { result } = mount(served({ turn_stop: 'end' }));
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    await response.settle({ turn_number: 4, active_seat: 'guest', turn_stop: null });

    expect(posted).toHaveBeenCalledWith('/games/abc123/cursor', { ends_turn: true });
    expect(onTurnStart).not.toHaveBeenCalled();
    expect(result.current.cursor.my_turn).toBe(false);
  });

  it('sends nothing when it is not your turn', () => {
    const { result } = mount(served({ my_turn: false, active_seat: 'guest' }));

    act(() => result.current.advance(vi.fn()));
    act(() => result.current.stepBack());

    expect(posted).not.toHaveBeenCalled();
  });

  it('steps back a stop', async () => {
    const { result } = mount(served({ turn_stop: 'contact:2' }));
    const response = pending();

    act(() => result.current.stepBack());
    await response.settle({ turn_number: 3, active_seat: 'host', turn_stop: 'contact:1' });

    expect(posted).toHaveBeenCalledWith('/games/abc123/cursor', { turn_stop: 'contact:1' });
  });

  it('reloads the cursor when a move is refused, and takes presses again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount(served({ turn_stop: 'main' }));
    const response = pending();

    act(() => result.current.advance(vi.fn()));
    await response.fail();

    expect(router.reload).toHaveBeenCalledWith({ only: ['cursor'] });

    pending();
    act(() => result.current.advance(vi.fn()));
    expect(posted).toHaveBeenCalledTimes(2);
  });

  it('starts the local turn once when the reload shows a failed move onto main committed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = mount();
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    await response.fail();
    expect(onTurnStart).not.toHaveBeenCalled();

    rerender({ cursor: served({ turn_stop: 'main' }) });
    act(() => result.current.receive({ turn_number: 3, active_seat: 'host', turn_stop: 'main' }));

    expect(onTurnStart).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('starts the local turn once when the echo of a failed move onto main lands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = mount();
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    await response.fail();
    act(() => result.current.receive({ turn_number: 3, active_seat: 'host', turn_stop: 'main' }));
    rerender({ cursor: served({ turn_stop: 'main' }) });

    expect(onTurnStart).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('starts the local turn when the echo lands before the move onto main fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount(served({ turn_number: 0, active_seat: null }));
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    act(() => result.current.receive({ turn_number: 1, active_seat: 'host', turn_stop: 'main' }));
    expect(onTurnStart).not.toHaveBeenCalled();
    await response.fail();

    expect(onTurnStart).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('does not start the local turn when the reload shows the move was refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = mount();
    const onTurnStart = vi.fn();
    const response = pending();

    act(() => result.current.advance(onTurnStart));
    await response.fail();
    rerender({ cursor: served() });
    act(() => result.current.receive({ turn_number: 3, active_seat: 'host', turn_stop: 'main' }));

    expect(onTurnStart).not.toHaveBeenCalled();
  });

  it('starts the local turn once when a retry succeeds after the failed move committed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount();
    const onTurnStart = vi.fn();
    const failed = pending();

    act(() => result.current.advance(onTurnStart));
    await failed.fail();
    const retry = pending();
    act(() => result.current.advance(onTurnStart));
    act(() => result.current.receive({ turn_number: 3, active_seat: 'host', turn_stop: 'main' }));
    await retry.settle({ turn_number: 3, active_seat: 'host', turn_stop: 'main' });

    expect(onTurnStart).toHaveBeenCalledOnce();
  });

  it('hands you the turn when the opponent ends theirs', () => {
    const { result } = mount(served({ active_seat: 'guest', my_turn: false, turn_stop: 'end' }));

    act(() => result.current.receive({ turn_number: 4, active_seat: 'host', turn_stop: null }));

    expect(result.current.cursor).toEqual(served({ turn_number: 4 }));
  });

  it('ignores a cursor from a turn already over', () => {
    const { result } = mount(served({ turn_number: 4, active_seat: 'guest', my_turn: false }));

    act(() => result.current.receive({ turn_number: 3, active_seat: 'host', turn_stop: 'end' }));

    expect(result.current.cursor).toEqual(
      served({ turn_number: 4, active_seat: 'guest', my_turn: false })
    );
  });

  it('takes a fresh cursor from the show payload', () => {
    const { result, rerender } = mount();

    rerender({ cursor: served({ turn_stop: 'end' }) });

    expect(result.current.cursor.turn_stop).toBe('end');
  });

  it('ignores a reloaded cursor from a turn the channel has already moved past', () => {
    const { result, rerender } = mount(
      served({ turn_number: 0, active_seat: null, my_turn: false })
    );

    act(() => result.current.receive({ turn_number: 1, active_seat: 'guest', turn_stop: 'main' }));
    rerender({ cursor: served({ turn_number: 0, active_seat: null, my_turn: false }) });

    expect(result.current.cursor).toEqual(
      served({ turn_number: 1, active_seat: 'guest', turn_stop: 'main', my_turn: false })
    );
  });

  it('takes a reloaded cursor from the same turn or a later one', () => {
    const { result, rerender } = mount(served({ turn_stop: 'main' }));

    rerender({ cursor: served({ turn_number: 4, active_seat: 'guest', my_turn: false }) });

    expect(result.current.cursor).toEqual(
      served({ turn_number: 4, active_seat: 'guest', my_turn: false })
    );
  });
});
