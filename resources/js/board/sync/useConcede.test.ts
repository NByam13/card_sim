import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConcede } from './useConcede';

vi.mock('./useGameSync', () => ({ postJson: vi.fn() }));
vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }));

const { postJson } = await import('./useGameSync');
const { router } = await import('@inertiajs/react');
const posted = vi.mocked(postJson);

const mount = (enabled = true) =>
  renderHook(({ enabled }) => useConcede({ code: 'abc123', gameNumber: 2, enabled }), {
    initialProps: { enabled },
  });

beforeEach(() => vi.clearAllMocks());

describe('useConcede', () => {
  it('asks before conceding, and backs out without posting', () => {
    const { result } = mount();

    act(() => result.current.open());
    expect(result.current.confirming).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.confirming).toBe(false);
    expect(posted).not.toHaveBeenCalled();
  });

  it('posts the concede once, closes and reloads the game', async () => {
    posted.mockResolvedValueOnce({});
    const { result } = mount();
    act(() => result.current.open());

    act(() => {
      result.current.concede();
      result.current.concede();
    });

    expect(posted).toHaveBeenCalledTimes(1);
    expect(posted).toHaveBeenCalledWith('/games/abc123/concede', { game_number: 2 });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.confirming).toBe(false);
    expect(router.reload).toHaveBeenCalledWith({ only: ['game', 'cursor', 'turnOrder'] });
  });

  it('names the match it is conceding in', () => {
    posted.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      useConcede({ code: 'abc123', matchNumber: 3, gameNumber: 1, enabled: true })
    );
    act(() => result.current.open());

    act(() => result.current.concede());

    expect(posted).toHaveBeenCalledWith('/games/abc123/concede', {
      match_number: 3,
      game_number: 1,
    });
  });

  it('saves the board before the concede stops saves', async () => {
    const order: string[] = [];
    const beforeRecord = vi.fn(async () => {
      order.push('save');
    });
    posted.mockImplementationOnce(async () => {
      order.push('concede');
      return {};
    });
    const { result } = renderHook(() =>
      useConcede({ code: 'abc123', gameNumber: 2, beforeRecord, enabled: true })
    );
    act(() => result.current.open());

    await act(async () => result.current.concede());

    expect(order).toEqual(['save', 'concede']);
  });

  it('stays open with an error when the concede is refused', async () => {
    posted.mockRejectedValueOnce(new Error('409'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount();
    act(() => result.current.open());

    act(() => result.current.concede());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.confirming).toBe(true);
  });

  it('closes once the game is no longer there to concede', () => {
    const { result, rerender } = mount();
    act(() => result.current.open());

    rerender({ enabled: false });

    expect(result.current.confirming).toBe(false);
  });

  it('does not reopen by itself when the next game becomes concedable', () => {
    const { result, rerender } = mount();
    act(() => result.current.open());

    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(result.current.confirming).toBe(false);
  });
});
