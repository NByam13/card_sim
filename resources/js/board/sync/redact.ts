import { GameState } from '../types';
import { HIDDEN_ZONES, PUBLIC_ZONES, PublicState, PublicZoneId, WireInstance } from './types';

/**
 * Strip a board down to what the opponent may see.
 *
 * The single choke point for hidden information: hidden zones become counts, and
 * a face-down card keeps its position, tapped state and counters but loses its
 * identity and its Inspiration override, which would hint at what it is.
 *
 * Ported from PonyRec's `multiplayer/redact.ts`.
 */
export function redact(state: GameState): PublicState {
  const zones = {} as Record<PublicZoneId, WireInstance[]>;

  for (const zone of PUBLIC_ZONES) {
    zones[zone] = state.zones[zone].map((instance): WireInstance => ({
      uid: instance.uid,
      cardNumber: instance.faceDown ? null : instance.card.card_number,
      tapped: instance.tapped,
      faceDown: instance.faceDown,
      counters: instance.counters,
      inspiration: instance.faceDown ? null : instance.inspiration,
    }));
  }

  return {
    zones,
    counts: Object.fromEntries(
      HIDDEN_ZONES.map((zone) => [zone, state.zones[zone].length])
    ) as PublicState['counts'],
    turn: state.turn,
    started: state.started,
  };
}
