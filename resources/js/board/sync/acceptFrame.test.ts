import { describe, expect, it } from 'vitest';
import { shouldAcceptFrame } from './acceptFrame';
import { HIDDEN_ZONES, PUBLIC_ZONES, PublicState, StateFrame } from './types';

/** Ported from PonyRec's `multiplayer/acceptFrame.test.ts`. */

function emptyState(): PublicState {
  return {
    zones: Object.fromEntries(
      PUBLIC_ZONES.map((zone) => [zone, []])
    ) as unknown as PublicState['zones'],
    counts: Object.fromEntries(
      HIDDEN_ZONES.map((zone) => [zone, 0])
    ) as unknown as PublicState['counts'],
    turn: 1,
    started: true,
  };
}

const frame = (session: string, seq: number, game_number = 1): StateFrame => ({
  game_number,
  session,
  seq,
  state: emptyState(),
});

describe('shouldAcceptFrame', () => {
  it('accepts the first frame and in-order progress', () => {
    expect(shouldAcceptFrame(null, frame('s1', 1))).toBe(true);
    expect(shouldAcceptFrame({ game_number: 1, session: 's1', seq: 1 }, frame('s1', 2))).toBe(true);
  });

  it('drops duplicates and frames that arrive out of order within a session', () => {
    expect(shouldAcceptFrame({ game_number: 1, session: 's1', seq: 5 }, frame('s1', 5))).toBe(
      false
    );
    expect(shouldAcceptFrame({ game_number: 1, session: 's1', seq: 5 }, frame('s1', 3))).toBe(
      false
    );
  });

  it('accepts a new session even if its seq restarts lower', () => {
    expect(shouldAcceptFrame({ game_number: 1, session: 's1', seq: 50 }, frame('s2', 1))).toBe(
      true
    );
  });

  it('takes any frame from a later game, and none from an earlier one', () => {
    const held = { game_number: 2, session: 's1', seq: 5 };

    expect(shouldAcceptFrame(held, frame('s1', 1, 3))).toBe(true);
    expect(shouldAcceptFrame(held, frame('s9', 99, 1))).toBe(false);
  });

  it('takes any session of a game after a snapshot of it', () => {
    expect(shouldAcceptFrame({ game_number: 2, session: null, seq: 0 }, frame('s1', 1, 2))).toBe(
      true
    );
  });
});
