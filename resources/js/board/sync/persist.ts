import { Card, Deck } from '@/types/cards';
import { ALL_ZONES, CardInstance, GameState, ZoneId } from '../types';

/**
 * A board serialized for the server, cards reduced to their numbers.
 *
 * Every card on your board came out of your own deck, so the number is enough to
 * rebuild it against the snapshot already on the game row — a saved board stays
 * a few KB instead of embedding the deck again.
 *
 * Ported from PonyRec's `multiplayer/persist.ts`, keyed on `card_number`.
 */
export interface CompactInstance {
  uid: string;
  cardNumber: string;
  tapped: boolean;
  faceDown: boolean;
  counters: number;
  inspiration: number | null;
}

/** Fields are optional where a board saved by an older deploy may not carry them. */
export interface CompactGameState {
  zones: Partial<Record<ZoneId, CompactInstance[]>>;
  turn: number;
  started: boolean;
  goingFirst?: boolean | null;
  mulliganed?: boolean;
  handDrawn?: boolean;
}

export function compactState(state: GameState): CompactGameState {
  const zones = {} as Record<ZoneId, CompactInstance[]>;

  for (const zone of ALL_ZONES) {
    zones[zone] = state.zones[zone].map((instance) => ({
      uid: instance.uid,
      cardNumber: instance.card.card_number,
      tapped: instance.tapped,
      faceDown: instance.faceDown,
      counters: instance.counters,
      inspiration: instance.inspiration,
    }));
  }

  return {
    zones,
    turn: state.turn,
    started: state.started,
    goingFirst: state.goingFirst,
    mulliganed: state.mulliganed,
    handDrawn: state.handDrawn,
  };
}

/**
 * Rebuild a board from a saved one, resolving numbers against the deck snapshot.
 *
 * Returns null when a number no longer resolves, which is the deck-was-edited
 * case — the caller deals fresh rather than restoring half a board.
 */
export function expandState(compact: CompactGameState, deck: Deck): GameState | null {
  const byNumber = new Map<string, Card>();
  for (const entry of deck.cards) {
    byNumber.set(entry.card.card_number, entry.card);
  }
  if (deck.main_character) {
    byNumber.set(deck.main_character.card_number, deck.main_character);
  }
  // A spawned token is a card on the board like any other, so a board carrying
  // one has to restore rather than read as unresolvable.
  deck.tokens?.forEach((token) => byNumber.set(token.card_number, token));

  const zones = {} as Record<ZoneId, CardInstance[]>;

  for (const zone of ALL_ZONES) {
    const instances: CardInstance[] = [];

    for (const saved of compact.zones[zone] ?? []) {
      const card = byNumber.get(saved.cardNumber);
      if (!card) return null;

      instances.push({
        uid: saved.uid,
        card,
        tapped: saved.tapped,
        faceDown: saved.faceDown,
        counters: saved.counters,
        inspiration: saved.inspiration,
      });
    }

    zones[zone] = instances;
  }

  return {
    zones,
    turn: compact.turn,
    started: compact.started,
    goingFirst: compact.goingFirst ?? null,
    mulliganed: compact.mulliganed ?? false,
    handDrawn: compact.handDrawn ?? true,
  };
}
