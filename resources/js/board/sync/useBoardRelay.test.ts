import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyZones } from '../setup';
import { CardInstance, GameState } from '../types';
import { useBoardRelay } from './useBoardRelay';

// The transport is the edge; everything above it is what these tests are about.
vi.mock('./useGameSync', () => ({ postJson: vi.fn(() => Promise.resolve()) }));

const { postJson } = await import('./useGameSync');
const posted = vi.mocked(postJson);

/** The calls to one endpoint, in order. */
function callsTo(path: string) {
  return posted.mock.calls.filter(([url]) => url.endsWith(path));
}

function boardWith(hand: CardInstance[] = []): GameState {
  return {
    zones: { ...emptyZones(), hand },
    turn: 1,
    started: true,
    goingFirst: null,
    mulliganed: false,
  };
}

function card(cardNumber: string): CardInstance {
  return {
    uid: `uid-${cardNumber}`,
    card: {
      card_number: cardNumber,
      name: 'Test Card',
      subtype: 'character',
      rarity: 'C',
      set_code: 'TEST',
      harmony_cost: 1,
      inspiration: 2,
      story_stage: null,
      card_text: null,
      image_url: null,
      thumb_url: null,
      card_back_url: null,
      release_status: 'released',
      variant: null,
    },
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

const relay = (enabled = true) => renderHook(() => useBoardRelay({ code: 'abc123', enabled }));

beforeEach(() => {
  posted.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBoardRelay', () => {
  it('relays a board as soon as it changes', () => {
    const { result } = relay();

    act(() => result.current.publish(boardWith()));

    expect(callsTo('/sync')).toHaveLength(1);
    expect(callsTo('/sync')[0][0]).toBe('/games/abc123/sync');
  });

  it('relays the redacted board, never the whole one', () => {
    const { result } = relay();

    act(() => result.current.publish(boardWith([card('TEST-C01')])));

    const frame = callsTo('/sync')[0][1] as { state: Record<string, unknown> };

    expect(frame.state.counts).toEqual({ library: 0, hand: 1, sceneDeck: 0 });
    expect(JSON.stringify(frame.state)).not.toContain('TEST-C01');
  });

  it('counts every frame up, so a mirror can order them', () => {
    const { result } = relay();

    act(() => result.current.publish(boardWith()));
    act(() => result.current.publish(boardWith()));
    act(() => result.current.publish(boardWith()));

    expect(callsTo('/sync').map(([, body]) => (body as { seq: number }).seq)).toEqual([1, 2, 3]);
  });

  it('sends one session for the life of the board', () => {
    const { result } = relay();

    act(() => result.current.publish(boardWith()));
    act(() => result.current.publish(boardWith()));

    const sessions = callsTo('/sync').map(([, body]) => (body as { session: string }).session);

    expect(sessions[0]).toEqual(expect.any(String));
    expect(new Set(sessions).size).toBe(1);
  });

  it('sends nothing while there is nobody to send to', () => {
    const { result } = relay(false);

    act(() => result.current.publish(boardWith()));
    act(() => vi.advanceTimersByTime(5000));

    expect(posted).not.toHaveBeenCalled();
  });

  describe('saving', () => {
    it('waits for the board to settle rather than saving every move', () => {
      const { result } = relay();

      act(() => result.current.publish(boardWith()));
      act(() => vi.advanceTimersByTime(500));
      act(() => result.current.publish(boardWith()));
      act(() => vi.advanceTimersByTime(500));
      act(() => result.current.publish(boardWith()));

      expect(callsTo('/state')).toHaveLength(0);

      act(() => vi.advanceTimersByTime(1500));

      expect(callsTo('/state')).toHaveLength(1);
    });

    it('saves the whole board and the redacted one together', () => {
      const { result } = relay();

      act(() => result.current.publish(boardWith([card('TEST-C01')])));
      act(() => vi.advanceTimersByTime(1500));

      const body = callsTo('/state')[0][1] as {
        state: { zones: Record<string, { cardNumber: string }[]> };
        public_state: { counts: Record<string, number> };
      };

      // The saved board keeps its cards; the relayed one is counts only.
      expect(body.state.zones.hand[0].cardNumber).toBe('TEST-C01');
      expect(body.public_state.counts.hand).toBe(1);
    });

    it('saves what is on the board when it is left mid-move', () => {
      const { result, unmount } = relay();

      act(() => result.current.publish(boardWith([card('TEST-C01')])));
      expect(callsTo('/state')).toHaveLength(0);

      unmount();

      expect(callsTo('/state')).toHaveLength(1);
    });
  });

  describe('announcing', () => {
    /**
     * A mirror discards a frame it has already passed, so re-sending the same
     * sequence would leave whoever just arrived looking at nothing.
     */
    it('re-sends the board under a new sequence', () => {
      const { result } = relay();

      act(() => result.current.publish(boardWith([card('TEST-C01')])));
      act(() => result.current.announce());

      const frames = callsTo('/sync');

      expect(frames).toHaveLength(2);
      expect((frames[1][1] as { seq: number }).seq).toBe(2);
      expect((frames[1][1] as { state: unknown }).state).toEqual(
        (frames[0][1] as { state: unknown }).state
      );
    });

    it('says nothing before there is a board to announce', () => {
      const { result } = relay();

      act(() => result.current.announce());

      expect(posted).not.toHaveBeenCalled();
    });

    it('does not announce to an empty table', () => {
      const { result } = relay(false);

      act(() => result.current.publish(boardWith()));
      act(() => result.current.announce());

      expect(posted).not.toHaveBeenCalled();
    });
  });
});
