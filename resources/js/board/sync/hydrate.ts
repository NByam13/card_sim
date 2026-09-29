import { Card } from '@/types/cards';
import { ALL_ZONES, CardInstance, GameState, ZoneId } from '../types';
import { HIDDEN_ZONES, HiddenZoneId, PUBLIC_ZONES, PublicState, WireInstance } from './types';

/**
 * The opponent's board, in the shape the table renders.
 *
 * A `GameState` so the same layout component draws it, plus the counts its
 * hidden zones were reduced to.
 */
export interface MirrorState extends GameState {
  counts: Record<HiddenZoneId, number>;
}

/**
 * A card the mirror cannot name: face down, or revealed but not yet resolved.
 *
 * Face-down backs are picked by zone rather than by subtype, because redaction
 * strips the subtype along with everything else that would identify the card.
 * The Scene Zone is the only public zone a face-down Scene can be in.
 */
function placeholder(zone: ZoneId, cardNumber: string | null): Card {
  return {
    card_number: cardNumber ?? '',
    // Shown while a revealed card is still resolving; a face-down card draws its
    // back and never reads this.
    name: cardNumber ?? '',
    subtype: zone === 'scene' ? 'scene' : 'character',
    rarity: '',
    set_code: '',
    harmony_cost: null,
    inspiration: null,
    story_stage: null,
    card_text: null,
    image_url: null,
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: null,
  };
}

/**
 * Turn a relayed board into one the table can draw, resolving card numbers
 * against whatever has been looked up so far.
 *
 * An unresolved card still renders — in its right zone, tapped or not, with its
 * counters — as a frame carrying its number. It fills in when the lookup lands,
 * so a slow or failed resolve costs art rather than the board.
 */
export function hydrateMirror(state: PublicState, cards: ReadonlyMap<string, Card>): MirrorState {
  const zones = {} as Record<ZoneId, CardInstance[]>;

  for (const zone of ALL_ZONES) {
    zones[zone] = [];
  }

  for (const zone of PUBLIC_ZONES) {
    zones[zone] = (state.zones[zone] ?? []).map((wire: WireInstance): CardInstance => ({
      uid: wire.uid,
      card:
        (wire.cardNumber ? cards.get(wire.cardNumber) : undefined) ??
        placeholder(zone, wire.cardNumber),
      tapped: wire.tapped,
      faceDown: wire.faceDown,
      counters: wire.counters,
      inspiration: wire.inspiration,
    }));
  }

  return {
    zones,
    counts: state.counts,
    turn: state.turn,
    started: state.started,
    // Neither crosses the wire: one is the sender's own lane numbering and the
    // other is theirs to spend.
    goingFirst: null,
    mulliganed: false,
  };
}

/** Every card number in a board that is not resolved yet. */
export function unresolvedNumbers(state: PublicState, cards: ReadonlyMap<string, Card>): string[] {
  const missing = new Set<string>();

  for (const zone of PUBLIC_ZONES) {
    for (const wire of state.zones[zone] ?? []) {
      if (wire.cardNumber !== null && !cards.has(wire.cardNumber)) {
        missing.add(wire.cardNumber);
      }
    }
  }

  return [...missing];
}

/** An empty mirror, for a seat that has not sent a board yet. */
export function emptyMirror(): MirrorState {
  const zones = {} as Record<ZoneId, CardInstance[]>;
  for (const zone of ALL_ZONES) {
    zones[zone] = [];
  }

  return {
    zones,
    counts: Object.fromEntries(HIDDEN_ZONES.map((zone) => [zone, 0])) as MirrorState['counts'],
    turn: 1,
    started: false,
    goingFirst: null,
    mulliganed: false,
  };
}
