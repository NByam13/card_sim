import { GameStatus, Seat, WinReason } from '@/types/game';
import { ALL_ZONES, ZoneId } from '../types';

/**
 * What crosses the wire between two seats.
 *
 * Ported from PonyRec's `decks/playtest/multiplayer/types.ts`, with cards
 * referenced by `card_number` rather than a PonyRec primary key.
 *
 * @see documentation/board-sync/spec.md
 */

/** Zones the opponent only ever learns a count of. */
export type HiddenZoneId = 'library' | 'hand' | 'sceneDeck';
export type PublicZoneId = Exclude<ZoneId, HiddenZoneId>;

export const HIDDEN_ZONES: HiddenZoneId[] = ['library', 'hand', 'sceneDeck'];
export const PUBLIC_ZONES: PublicZoneId[] = ALL_ZONES.filter(
  (zone): zone is PublicZoneId => !(HIDDEN_ZONES as ZoneId[]).includes(zone)
);

/** One card as the opponent sees it. `cardNumber` is null while it is face down. */
export interface WireInstance {
  uid: string;
  cardNumber: string | null;
  tapped: boolean;
  faceDown: boolean;
  counters: number;
  inspiration: number | null;
}

export interface PublicState {
  zones: Record<PublicZoneId, WireInstance[]>;
  counts: Record<HiddenZoneId, number>;
  turn: number;
  started: boolean;
}

/** The shared turn cursor, as the server broadcasts it. */
export interface WireCursor {
  /** Turn numbers restart each game of a Bo3, so a cursor's order is (game, turn). */
  game_number: number;
  turn_number: number;
  active_seat: Seat | null;
  /** Opaque to the server; the setup's turn track reads it. Null until the turn's first move. */
  turn_stop: string | null;
}

/** The cursor as one viewer sees it, with whether it is theirs to move. */
export interface TurnCursor extends WireCursor {
  my_turn: boolean;
}

/** One game's recorded result. */
export interface GameResult {
  game: number;
  winner: Seat;
  reason: WinReason;
}

/** A game was recorded, as the server broadcasts it. `winner_seat` is set once the match is over. */
export interface GameFinishedPayload {
  status: GameStatus;
  game_results: GameResult[];
  winner_seat: Seat | null;
}

/** The dice for turn order. Ties are rerolled, so the two totals always differ. */
export interface TurnOrderRoll {
  host: number[];
  guest: number[];
  winner: Seat;
  rerolls: number;
}

/** Turn order as it stands: no roll, a roll awaiting the winner's choice, or decided. */
export interface TurnOrder {
  /** The game this turn order is for. Each game of a Bo3 decides it afresh. */
  game_number: number;
  roll: TurnOrderRoll | null;
  first_player: Seat | null;
  /** Who elects: the roll winner in game 1, the last game's loser after it. */
  chooser: Seat | null;
}

export interface StateFrame {
  /** The game the board was dealt for. A frame from an earlier one is stale. */
  game_number: number;
  /** Changes when the sender's board remounts, which restarts `seq`. */
  session: string;
  seq: number;
  state: PublicState;
}

export interface FrameCursor {
  game_number: number;
  /** Null after a server snapshot, so any session of that game is newer. */
  session: string | null;
  seq: number;
}
