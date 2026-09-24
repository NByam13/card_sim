import { Card, Deck } from '@/types/cards';
import { describe, expect, it } from 'vitest';
import { emptyZones } from '../setup';
import { CardInstance, GameState, ZoneId } from '../types';
import { compactState, expandState } from './persist';

/** Ported from PonyRec's `multiplayer/persist.test.ts`, keyed on card_number. */

let counter = 0;

function card(overrides: Partial<Card> = {}): Card {
  return {
    card_number: `TEST-C${counter++}`,
    name: 'Test Card',
    subtype: 'character',
    rarity: 'C',
    set_code: 'TEST',
    harmony_cost: 1,
    inspiration: 2,
    story_stage: null,
    card_text: null,
    image_url: null,
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: null,
    ...overrides,
  };
}

function inst(overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    uid: `uid-${counter++}`,
    card: card(),
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
    ...overrides,
  };
}

function gameState(
  zones: Partial<Record<ZoneId, CardInstance[]>>,
  extra: Partial<GameState> = {}
): GameState {
  return {
    zones: { ...emptyZones(), ...zones },
    turn: 1,
    started: false,
    goingFirst: null,
    mulliganed: false,
    ...extra,
  };
}

function deck(cards: Card[], extra: Partial<Deck> = {}): Deck {
  return {
    code: 'test',
    name: 'Test Deck',
    main_character: null,
    cards: cards.map((c) => ({ card: c, zone: 'main' as const, quantity: 1 })),
    tokens: [],
    ...extra,
  };
}

/** A deck whose pool covers every card on the board. */
function deckFor(state: GameState, mainCharacter: Card | null = null): Deck {
  const cards = Object.values(state.zones)
    .flat()
    .map((instance) => instance.card)
    .filter((c) => c.card_number !== mainCharacter?.card_number);

  return deck(cards, { main_character: mainCharacter });
}

describe('compactState / expandState', () => {
  it('round-trips a board through the compact form', () => {
    const mainCharacter = card({ subtype: 'main-character' });
    const state = gameState(
      {
        hand: [inst({ uid: 'h1' })],
        adventureC: [inst({ uid: 'a1', tapped: true, counters: 3, inspiration: 9 })],
        planII: [inst({ uid: 'p1', faceDown: true })],
        mainChar: [inst({ uid: 'mc', card: mainCharacter })],
      },
      { turn: 6, started: true }
    );

    expect(expandState(compactState(state), deckFor(state, mainCharacter))).toEqual(state);
  });

  it('restores a board with a spawned token on it', () => {
    // A token comes from `deck.tokens`, not `deck.cards`, so without that pool a
    // reconnect reads the board as unresolvable and re-deals it.
    const candy = card({ name: 'Candy', subtype: 'token' });
    const character = inst({ uid: 'a1' });
    const state = gameState({ adventureC: [character, inst({ uid: 't1', card: candy })] });

    const restored = expandState(compactState(state), deck([character.card], { tokens: [candy] }));

    expect(restored).toEqual(state);
  });

  it('keeps the compact form free of card objects', () => {
    const state = gameState({ hand: [inst()] });
    const compact = compactState(state);

    expect(compact.zones.hand?.[0]).not.toHaveProperty('card');
    expect(compact.zones.hand?.[0].cardNumber).toBe(state.zones.hand[0].card.card_number);
  });

  it('returns null when a saved card no longer exists in the deck', () => {
    const state = gameState({ hand: [inst()] });

    expect(expandState(compactState(state), deck([]))).toBeNull();
  });

  it('tolerates a zone missing from a saved board', () => {
    const state = gameState({ hand: [inst()] });
    const compact = compactState(state);
    delete compact.zones.retire;

    expect(expandState(compact, deckFor(state))?.zones.retire).toEqual([]);
  });

  it('carries a spent mulligan across a save and restore', () => {
    const state = gameState({ hand: [inst()] }, { mulliganed: true });

    expect(expandState(compactState(state), deckFor(state))?.mulliganed).toBe(true);
  });

  it('restores a board saved without the mulligan flag as unspent', () => {
    const state = gameState({ hand: [inst()] });
    const compact = compactState(state);
    delete compact.mulliganed;

    expect(expandState(compact, deckFor(state))?.mulliganed).toBe(false);
  });

  it('carries which seat is on the play', () => {
    const state = gameState({ hand: [inst()] }, { goingFirst: true });

    expect(expandState(compactState(state), deckFor(state))?.goingFirst).toBe(true);
  });

  /** Four copies of one card share a number; their uids are what tell them apart. */
  it('restores four copies of the same card as four distinct instances', () => {
    const copy = card();
    const state = gameState({
      hand: [
        inst({ uid: 'c1', card: copy }),
        inst({ uid: 'c2', card: copy }),
        inst({ uid: 'c3', card: copy }),
        inst({ uid: 'c4', card: copy }),
      ],
    });

    const restored = expandState(compactState(state), deck([copy]));

    expect(restored?.zones.hand.map((i) => i.uid)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});
