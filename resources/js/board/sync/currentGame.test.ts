import { describe, expect, it } from 'vitest';
import { cursorFor, turnOrderFor } from './currentGame';
import { TurnCursor, TurnOrder } from './types';

const gameOneDecided: TurnOrder = {
  game_number: 1,
  roll: { host: [6, 5], guest: [2, 1], winner: 'host', rerolls: 0 },
  first_player: 'host',
  chooser: 'host',
};

const gameOneLate: TurnCursor = {
  game_number: 1,
  turn_number: 7,
  active_seat: 'guest',
  turn_stop: 'contact:2',
  my_turn: true,
};

describe('turnOrderFor', () => {
  it('passes through turn order for the game the page is on', () => {
    expect(turnOrderFor(1, gameOneDecided)).toBe(gameOneDecided);
  });

  it("holds back the last game's decision, so the next board does not deal on it", () => {
    expect(turnOrderFor(2, gameOneDecided)).toEqual({
      game_number: 2,
      roll: null,
      first_player: null,
      chooser: null,
    });
  });
});

describe('cursorFor', () => {
  it('passes through the cursor for the game the page is on', () => {
    expect(cursorFor(1, gameOneLate)).toBe(gameOneLate);
  });

  it('starts the next game before turn 1, with nobody to move', () => {
    expect(cursorFor(2, gameOneLate)).toEqual({
      game_number: 2,
      turn_number: 0,
      active_seat: null,
      turn_stop: null,
      my_turn: false,
    });
  });
});
