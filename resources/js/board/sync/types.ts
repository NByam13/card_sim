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

export type Seat = 'host' | 'guest';

export interface StateFrame {
  /** Changes when the sender's board remounts, which restarts `seq`. */
  session: string;
  seq: number;
  state: PublicState;
}

export interface FrameCursor {
  session: string;
  seq: number;
}
