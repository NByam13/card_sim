import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card } from '@/types/cards';
import { emptyZones } from '../setup';
import { CardInstance, GameState, ZoneId } from '../types';
import { useWinClaim } from './useWinClaim';

vi.mock('./useGameSync', () => ({ postJson: vi.fn() }));
vi.mock('@inertiajs/react', () => ({ router: { reload: vi.fn() } }));

const { postJson } = await import('./useGameSync');
const { router } = await import('@inertiajs/react');
const posted = vi.mocked(postJson);

const mainCharacter: CardInstance = {
  uid: 'mc',
  card: { name: 'Twilight', subtype: 'main-character' } as Card,
  tapped: false,
  faceDown: false,
  counters: 0,
  inspiration: null,
};

function board(zone: ZoneId, started = true): GameState {
  return {
    zones: { ...emptyZones(), [zone]: [mainCharacter] },
    turn: 5,
    started,
    goingFirst: true,
    mulliganed: false,
    handDrawn: true,
  };
}

const mount = (restoring: GameState | null = null, enabled = true) =>
  renderHook(({ enabled }) => useWinClaim({ code: 'abc123', gameNumber: 2, restoring, enabled }), {
    initialProps: { enabled },
  });

beforeEach(() => vi.clearAllMocks());

describe('useWinClaim', () => {
  it('prompts when the Main Character arrives on Stage IV', () => {
    const { result } = mount();

    act(() => result.current.watch(board('storyIII')));
    expect(result.current.prompting).toBe(false);
    expect(result.current.claimable).toBe(false);

    act(() => result.current.watch(board('storyIV')));
    expect(result.current.prompting).toBe(true);
    expect(result.current.claimable).toBe(true);
  });

  it('stays dismissed while the Main Character stays, and keeps the claim on offer', () => {
    const { result } = mount();
    act(() => result.current.watch(board('storyIV')));

    act(() => result.current.dismiss());
    act(() => result.current.watch(board('storyIV')));

    expect(result.current.prompting).toBe(false);
    expect(result.current.claimable).toBe(true);

    act(() => result.current.open());
    expect(result.current.prompting).toBe(true);
  });

  it('prompts again when the Main Character leaves Stage IV and comes back', () => {
    const { result } = mount();
    act(() => result.current.watch(board('storyIV')));
    act(() => result.current.dismiss());

    act(() => result.current.watch(board('storyIII')));
    act(() => result.current.watch(board('storyIV')));

    expect(result.current.prompting).toBe(true);
  });

  it('does not prompt for a restored board already on Stage IV', () => {
    const { result } = mount(board('storyIV'));

    act(() => result.current.watch(board('storyIV')));

    expect(result.current.prompting).toBe(false);
    expect(result.current.claimable).toBe(true);
  });

  it('ignores a board that has not started', () => {
    const { result } = mount();

    act(() => result.current.watch(board('storyIV', false)));

    expect(result.current.prompting).toBe(false);
  });

  it('offers nothing while a claim could not be accepted', () => {
    const { result, rerender } = mount(null, false);

    act(() => result.current.watch(board('storyIV')));
    expect(result.current.prompting).toBe(false);
    expect(result.current.claimable).toBe(false);

    rerender({ enabled: true });
    expect(result.current.claimable).toBe(true);
    expect(result.current.prompting).toBe(false);
  });

  it('does not reopen a prompt the game ended under once the next game is undecided', () => {
    const { result, rerender } = mount();
    act(() => result.current.watch(board('storyIV')));
    expect(result.current.prompting).toBe(true);

    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(result.current.prompting).toBe(false);
    expect(result.current.claimable).toBe(true);
  });

  it('clears a refused claim’s error when the Main Character arrives again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    posted.mockRejectedValueOnce(new Error('409'));
    const { result } = mount();
    act(() => result.current.watch(board('storyIV')));
    await act(async () => result.current.claim());
    act(() => result.current.dismiss());

    act(() => result.current.watch(board('storyIII')));
    act(() => result.current.watch(board('storyIV')));

    expect(result.current.prompting).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('posts the claim, closes the prompt and reloads the game', async () => {
    posted.mockResolvedValueOnce({});
    const { result } = mount();
    act(() => result.current.watch(board('storyIV')));

    await act(async () => result.current.claim());

    expect(posted).toHaveBeenCalledWith('/games/abc123/claim-win', { game_number: 2 });
    expect(result.current.prompting).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(router.reload).toHaveBeenCalledWith({ only: ['game', 'cursor', 'turnOrder'] });
  });

  it('saves the board before the claim stops saves', async () => {
    const order: string[] = [];
    let saved!: () => void;
    const beforeRecord = vi.fn(() => {
      order.push('save');
      return new Promise<void>((resolve) => (saved = resolve));
    });
    posted.mockImplementationOnce(async () => {
      order.push('claim');
      return {};
    });
    const { result } = renderHook(() =>
      useWinClaim({ code: 'abc123', gameNumber: 2, beforeRecord, restoring: null, enabled: true })
    );

    act(() => result.current.claim());
    expect(posted).not.toHaveBeenCalled();
    await act(async () => saved());

    expect(order).toEqual(['save', 'claim']);
  });

  it('keeps the prompt open with an error when the claim is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    posted.mockRejectedValueOnce(new Error('409'));
    const { result } = mount();
    act(() => result.current.watch(board('storyIV')));

    await act(async () => result.current.claim());

    expect(result.current.prompting).toBe(true);
    expect(result.current.error).toMatch(/could not be recorded/);
    expect(router.reload).toHaveBeenCalledWith({ only: ['game', 'cursor', 'turnOrder'] });
  });
});
