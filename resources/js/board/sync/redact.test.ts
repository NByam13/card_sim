import { Card } from '@/types/cards';
import { describe, expect, it } from 'vitest';
import { emptyZones } from '../setup';
import { CardInstance, GameState, ZoneId } from '../types';
import { redact } from './redact';
import { PUBLIC_ZONES } from './types';

/** Ported from PonyRec's `multiplayer/redact.test.ts`. */

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

describe('redact', () => {
  it('reduces hidden zones to counts and never ships their contents', () => {
    const state = gameState({
      library: [inst(), inst(), inst()],
      hand: [inst(), inst()],
      sceneDeck: [inst()],
    });

    const publicState = redact(state);

    expect(publicState.counts).toEqual({ library: 3, hand: 2, sceneDeck: 1 });
    expect(Object.keys(publicState.zones)).toEqual(PUBLIC_ZONES);

    // Belt and braces: no hidden card's uid or number survives anywhere.
    const hidden = state.zones.library.concat(state.zones.hand, state.zones.sceneDeck);
    const serialized = JSON.stringify(publicState);
    hidden.forEach((instance) => {
      expect(serialized).not.toContain(instance.uid);
      expect(serialized).not.toContain(instance.card.card_number);
    });
  });

  it('ships the Reveal Zone with full card identity', () => {
    const revealed = inst({ uid: 'shown' });
    const publicState = redact(gameState({ reveal: [revealed] }));

    expect(publicState.zones.reveal).toEqual([
      {
        uid: 'shown',
        cardNumber: revealed.card.card_number,
        tapped: false,
        faceDown: false,
        counters: 0,
        inspiration: null,
      },
    ]);
  });

  it('keeps face-up public cards with their card number', () => {
    const played = inst({ uid: 'char', tapped: true, counters: 2, inspiration: 5 });
    const publicState = redact(gameState({ adventureC: [played] }));

    expect(publicState.zones.adventureC).toEqual([
      {
        uid: 'char',
        cardNumber: played.card.card_number,
        tapped: true,
        faceDown: false,
        counters: 2,
        inspiration: 5,
      },
    ]);
  });

  it('strips identity and inspiration from a face-down card but keeps its position state', () => {
    const plan = inst({ uid: 'plan', faceDown: true, counters: 1, inspiration: 7 });
    const publicState = redact(gameState({ planII: [plan] }));

    expect(publicState.zones.planII).toEqual([
      {
        uid: 'plan',
        cardNumber: null,
        tapped: false,
        faceDown: true,
        counters: 1,
        inspiration: null,
      },
    ]);
  });

  it('does not leak a face-down card’s number anywhere in the payload', () => {
    const plan = inst({ uid: 'plan', faceDown: true });
    const serialized = JSON.stringify(redact(gameState({ planII: [plan] })));

    expect(serialized).not.toContain(plan.card.card_number);
  });

  it('preserves zone ordering, turn and started', () => {
    const first = inst({ uid: 'first' });
    const second = inst({ uid: 'second' });
    const publicState = redact(gameState({ scene: [first, second] }, { turn: 4, started: true }));

    expect(publicState.zones.scene.map((wire) => wire.uid)).toEqual(['first', 'second']);
    expect(publicState.turn).toBe(4);
    expect(publicState.started).toBe(true);
  });
});
