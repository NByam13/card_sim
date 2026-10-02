import { TurnCursor, TurnOrder } from './types';

/** Turn order for the game the page is on: what is held if it belongs to that game, else undecided. */
export function turnOrderFor(gameNumber: number, held: TurnOrder): TurnOrder {
  return held.game_number === gameNumber
    ? held
    : { game_number: gameNumber, roll: null, first_player: null, chooser: null };
}

/** The cursor for the game the page is on: what is held if it belongs to that game, else before turn 1. */
export function cursorFor(gameNumber: number, held: TurnCursor): TurnCursor {
  return held.game_number === gameNumber
    ? held
    : {
        game_number: gameNumber,
        turn_number: 0,
        active_seat: null,
        turn_stop: null,
        my_turn: false,
      };
}
