import { describe, expect, it } from 'vitest';
import { TurnCursor } from '../sync/types';
import {
  advanceLabel,
  contactLane,
  CursorMove,
  displayStops,
  drawsOnTurnStart,
  FIRST_CONTACT_TURN,
  next,
  previous,
  startsTurn,
  stopsForTurn,
} from './turnTrack';

const cursor = (over: Partial<TurnCursor> = {}): TurnCursor => ({
  game_number: 1,
  turn_number: 3,
  active_seat: 'host',
  turn_stop: null,
  my_turn: true,
  ...over,
});

/** Apply a move the way the server does, for walking a whole turn. */
function land(at: TurnCursor, move: CursorMove): TurnCursor {
  if ('ends_turn' in move) {
    return {
      game_number: 1,
      turn_number: at.turn_number + 1,
      active_seat: 'guest',
      turn_stop: null,
      my_turn: false,
    };
  }

  return { ...at, turn_number: Math.max(at.turn_number, 1), turn_stop: move.turn_stop };
}

/** Every move one seat's presses make from the start of a turn until it hands over. */
function walk(start: TurnCursor): CursorMove[] {
  const moves: CursorMove[] = [];
  let at = start;

  for (let move = next(at); move; move = at.my_turn ? next(at) : null) {
    moves.push(move);
    at = land(at, move);
  }

  return moves;
}

describe('stopsForTurn', () => {
  it('walks main, the three lanes in order, then end', () => {
    expect(stopsForTurn(3)).toEqual(['main', 'contact:1', 'contact:2', 'contact:3', 'end']);
    expect(stopsForTurn(9)).toEqual(stopsForTurn(3));
  });

  it('has no contact before the first-contact turn', () => {
    expect(FIRST_CONTACT_TURN).toBe(3);
    expect(stopsForTurn(1)).toEqual(['main', 'end']);
    expect(stopsForTurn(2)).toEqual(['main', 'end']);
  });
});

describe('next', () => {
  it('walks a full turn from its start to handing it over', () => {
    expect(walk(cursor())).toEqual([
      { turn_stop: 'main' },
      { turn_stop: 'contact:1' },
      { turn_stop: 'contact:2' },
      { turn_stop: 'contact:3' },
      { turn_stop: 'end' },
      { ends_turn: true },
    ]);
  });

  it('walks main straight to end before contact is legal', () => {
    expect(walk(cursor({ turn_number: 2 }))).toEqual([
      { turn_stop: 'main' },
      { turn_stop: 'end' },
      { ends_turn: true },
    ]);
  });

  it('opens the game onto turn 1 main', () => {
    expect(next(cursor({ turn_number: 0, active_seat: null }))).toEqual({
      turn_stop: 'main',
    });
    expect(walk(cursor({ turn_number: 0, active_seat: null }))).toHaveLength(3);
  });

  it('refuses to move when it is not your turn', () => {
    expect(next(cursor({ my_turn: false }))).toBeNull();
    expect(next(cursor({ my_turn: false, turn_stop: 'end' }))).toBeNull();
  });

  it('refuses a stop this turn does not have', () => {
    expect(next(cursor({ turn_number: 2, turn_stop: 'contact:1' }))).toBeNull();
    expect(next(cursor({ turn_stop: 'somewhere' }))).toBeNull();
  });
});

describe('previous', () => {
  it('steps back one stop at a time', () => {
    expect(previous(cursor({ turn_stop: 'end' }))).toEqual({ turn_stop: 'contact:3' });
    expect(previous(cursor({ turn_stop: 'contact:1' }))).toEqual({ turn_stop: 'main' });
    expect(previous(cursor({ turn_number: 1, turn_stop: 'end' }))).toEqual({
      turn_stop: 'main',
    });
  });

  it('never steps back out of main or across a turn', () => {
    expect(previous(cursor({ turn_stop: 'main' }))).toBeNull();
    expect(previous(cursor({ turn_stop: null }))).toBeNull();
  });

  it('refuses to move when it is not your turn', () => {
    expect(previous(cursor({ my_turn: false, turn_stop: 'end' }))).toBeNull();
  });
});

describe('startsTurn', () => {
  it('is only the move onto the first stop', () => {
    expect(startsTurn(cursor(), { turn_stop: 'main' })).toBe(true);
    expect(startsTurn(cursor({ turn_stop: 'main' }), { turn_stop: 'contact:1' })).toBe(false);
    expect(startsTurn(cursor({ turn_stop: 'end' }), { ends_turn: true })).toBe(false);
  });
});

describe('drawsOnTurnStart', () => {
  it('skips the draw on turn 1, which the player on the play opens', () => {
    expect(drawsOnTurnStart(cursor({ turn_number: 0, active_seat: null }))).toBe(false);
  });

  it('draws for the other seat on its first turn', () => {
    expect(drawsOnTurnStart(cursor({ turn_number: 2, active_seat: 'guest' }))).toBe(true);
  });

  it('draws on every later turn, for either seat', () => {
    expect(drawsOnTurnStart(cursor({ turn_number: 3, active_seat: 'host' }))).toBe(true);
    expect(drawsOnTurnStart(cursor({ turn_number: 4, active_seat: 'guest' }))).toBe(true);
  });
});

describe('advanceLabel', () => {
  it('names what each press on turn 3 does', () => {
    const stops = [null, 'main', 'contact:1', 'contact:2', 'contact:3', 'end'];

    expect(stops.map((turn_stop) => advanceLabel(cursor({ turn_stop })))).toEqual([
      'Start turn',
      'Contact',
      'Lane 2',
      'Lane 3',
      'End phase',
      'End turn',
    ]);
  });

  it('goes from main straight to the end phase before contact is legal', () => {
    expect(advanceLabel(cursor({ turn_number: 1, turn_stop: 'main' }))).toBe('End phase');
  });

  it('opens the game from turn 0', () => {
    expect(advanceLabel(cursor({ turn_number: 0, active_seat: null }))).toBe('Start turn');
  });

  it('has nothing to say when it is not your turn', () => {
    expect(advanceLabel(cursor({ turn_stop: 'main', my_turn: false }))).toBeNull();
  });
});

describe('displayStops', () => {
  const keys = (turnNumber: number, turnStop: string | null) =>
    displayStops(turnNumber, turnStop).map((stop) => stop.key);

  it('folds contact into one stop outside it', () => {
    expect(keys(3, 'main')).toEqual(['start', 'main', 'contact', 'end']);
  });

  it('opens contact into its lanes while the cursor is in one', () => {
    expect(keys(3, 'contact:2')).toEqual([
      'start',
      'main',
      'contact:1',
      'contact:2',
      'contact:3',
      'end',
    ]);
  });

  it('draws contact locked before it is legal', () => {
    const contact = displayStops(FIRST_CONTACT_TURN - 1, 'main').find((s) => s.key === 'contact');

    expect(contact?.locked).toBe(true);
    expect(displayStops(FIRST_CONTACT_TURN, 'main').find((s) => s.key === 'contact')?.locked).toBe(
      false
    );
  });
});

describe('contactLane', () => {
  it('reads the lane out of a contact stop', () => {
    expect(contactLane('contact:1')).toBe(1);
    expect(contactLane('contact:3')).toBe(3);
  });

  it('is null outside contact, and for a lane the track does not have', () => {
    expect(contactLane(null)).toBeNull();
    expect(contactLane('main')).toBeNull();
    expect(contactLane('contact:4')).toBeNull();
  });
});
