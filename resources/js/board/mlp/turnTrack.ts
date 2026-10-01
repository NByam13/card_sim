import { TurnCursor } from '../sync/types';

/**
 * MLP's turn track: the stops a turn walks through, and the move a press sends
 * to the cursor endpoint.
 *
 * Ported from PonyRec's `multiplayer/phases.ts`, with the phase and contact lane
 * folded into one opaque `turn_stop` key. There is no `start` stop: the press
 * that starts a turn lands it straight on `main`.
 */

export type TurnStop = 'main' | 'contact:1' | 'contact:2' | 'contact:3' | 'end';

/** The first turn on which contact is legal. PonyRec's `Game::FIRST_CONTACT_TURN`. */
export const FIRST_CONTACT_TURN = 3;

/** The body of a `POST /games/{code}/cursor`. */
export type CursorMove = { turn_stop: TurnStop } | { ends_turn: true };

/** The stops this turn walks through, in order. */
export function stopsForTurn(turnNumber: number): TurnStop[] {
  const contact: TurnStop[] =
    turnNumber >= FIRST_CONTACT_TURN ? ['contact:1', 'contact:2', 'contact:3'] : [];

  return ['main', ...contact, 'end'];
}

/** A cursor on turn 0 has not opened the game yet; its first move opens turn 1. */
export function trackTurn(cursor: TurnCursor): number {
  return Math.max(cursor.turn_number, 1);
}

/** The cursor's stop on this turn's track: -1 before the turn starts, null for a stop the turn does not have. */
function position(cursor: TurnCursor): number | null {
  if (cursor.turn_stop === null) return -1;

  const index = stopsForTurn(trackTurn(cursor)).indexOf(cursor.turn_stop as TurnStop);

  return index === -1 ? null : index;
}

/**
 * The move one press makes: onto the next stop, or, from `end`, handing the turn
 * over. Null when it is not your turn, or the cursor sits on a stop this track
 * does not know.
 */
export function next(cursor: TurnCursor): CursorMove | null {
  if (!cursor.my_turn) return null;

  const at = position(cursor);
  if (at === null) return null;

  const stop = stopsForTurn(trackTurn(cursor))[at + 1];

  return stop ? { turn_stop: stop } : { ends_turn: true };
}

/** The move a step back makes. Null from `main` and before it: a step back never crosses a turn. */
export function previous(cursor: TurnCursor): CursorMove | null {
  if (!cursor.my_turn) return null;

  const at = position(cursor);
  if (at === null || at < 1) return null;

  return { turn_stop: stopsForTurn(trackTurn(cursor))[at - 1] };
}

/** Whether this move starts the turn, which is when the local board untaps and draws. */
export function startsTurn(cursor: TurnCursor, move: CursorMove): boolean {
  return cursor.turn_stop === null && 'turn_stop' in move;
}

/** Whether the turn a press from this cursor starts draws. The player on the play skips it on turn 1. */
export function drawsOnTurnStart(cursor: TurnCursor): boolean {
  return trackTurn(cursor) > 1;
}

/** A stop's name on the seam bar. */
export function stopLabel(stop: TurnStop): string {
  if (stop === 'main') return 'Main';
  if (stop === 'end') return 'End';

  return `Lane ${stop.slice('contact:'.length)}`;
}

/** The contact lane a stop is in, by contact order, or null outside contact. */
export function contactLane(turnStop: string | null): number | null {
  const match = turnStop?.match(/^contact:([1-3])$/);

  return match ? Number(match[1]) : null;
}

/** What one press does, for the button that makes it. Null when it is not your turn. */
export function advanceLabel(cursor: TurnCursor): string | null {
  const move = next(cursor);
  if (!move) return null;
  if ('ends_turn' in move) return 'End turn';
  if (startsTurn(cursor, move)) return 'Start turn';
  if (move.turn_stop === 'contact:1') return 'Contact';
  if (move.turn_stop === 'end') return 'End phase';

  return stopLabel(move.turn_stop);
}

/** A stop as the seam bar draws it. `locked` stops are drawn but never reached by a press. */
export interface DisplayStop {
  key: 'start' | 'contact' | TurnStop;
  label: string;
  locked: boolean;
}

/**
 * The strip the seam bar draws: `Start › Main › Contact › End`, where Contact
 * opens into its lanes while the cursor is in one. Contact is drawn locked on
 * the turns before it is legal, so the strip keeps its width.
 */
export function displayStops(turnNumber: number, turnStop: string | null): DisplayStop[] {
  const inContact = turnStop?.startsWith('contact:') ?? false;
  const contact: DisplayStop[] = inContact
    ? (['contact:1', 'contact:2', 'contact:3'] as const).map((key) => ({
        key,
        label: stopLabel(key),
        locked: false,
      }))
    : [{ key: 'contact', label: 'Contact', locked: turnNumber < FIRST_CONTACT_TURN }];

  return [
    { key: 'start', label: 'Start', locked: true },
    { key: 'main', label: stopLabel('main'), locked: false },
    ...contact,
    { key: 'end', label: stopLabel('end'), locked: false },
  ];
}
