import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, Deck } from '@/types/cards';
import { emptyZones } from './setup';
import {
  ADVENTURE_ZONES,
  CardInstance,
  GameState,
  laneNumber,
  laneZoneForNumber,
  rendersLandscape,
  ZoneId,
} from './types';
import { Action, nextPlanSlot, promotionTarget, reducer, useGame } from './useGame';

/**
 * Ported from PonyRec's `decks/playtest/useGame.test.ts`, which is the closest
 * thing the board has to a specification. The only edits are the card fixture
 * (this app's `Card` is the deck endpoint's, not PonyRec's catalogue model) and
 * the deck fixture's `slug` becoming `code`.
 *
 * One test did not come over: "survives a reconnect through the persistence
 * round trip", which drives `compactState`/`expandState`. There is no
 * persistence in this slice; it ports with the one that adds it.
 */

/** Minimal Card fixture — the reducer only reads subtype/inspiration off the card. */
function card(overrides: Partial<Card> = {}): Card {
  return {
    card_number: 'BP01-C01',
    name: 'Test Card',
    subtype: 'character',
    rarity: 'C',
    set_code: 'BP01',
    harmony_cost: 1,
    inspiration: 2,
    story_stage: null,
    image_url: null,
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: null,
    ...overrides,
  };
}

let uidCounter = 0;
/** A board card instance with predictable defaults. `uid` is auto-incremented unless given. */
function inst(overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    uid: overrides.uid ?? `uid-${uidCounter++}`,
    card: overrides.card ?? card(),
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
    ...overrides,
  };
}

/** Build a GameState from a partial zone map (missing zones default to empty). */
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

const run = (state: GameState, action: Action) => reducer(state, action);

describe('DRAW', () => {
  it('moves the top N cards from library to hand', () => {
    const lib = [inst({ uid: 'a' }), inst({ uid: 'b' }), inst({ uid: 'c' })];
    const next = run(gameState({ library: lib }), { type: 'DRAW', n: 2 });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['a', 'b']);
    expect(next.zones.library.map((c) => c.uid)).toEqual(['c']);
  });

  it('draws only what is left when N exceeds the library', () => {
    const next = run(gameState({ library: [inst()] }), { type: 'DRAW', n: 5 });
    expect(next.zones.hand).toHaveLength(1);
    expect(next.zones.library).toHaveLength(0);
  });

  it('is a no-op on an empty library', () => {
    const state = gameState({ library: [] });
    expect(run(state, { type: 'DRAW', n: 1 })).toBe(state);
  });
});

describe('MOVE_CARD', () => {
  it('moves a card between zones, appending to the destination', () => {
    const moving = inst({ uid: 'm' });
    const next = run(gameState({ hand: [moving], adventureC: [inst({ uid: 'x' })] }), {
      type: 'MOVE_CARD',
      uid: 'm',
      toZone: 'adventureC',
    });

    expect(next.zones.hand).toHaveLength(0);
    expect(next.zones.adventureC.map((c) => c.uid)).toEqual(['x', 'm']);
  });

  it('inserts at the requested index', () => {
    const moving = inst({ uid: 'm' });
    const next = run(gameState({ retire: [moving], library: [inst({ uid: 'l' })] }), {
      type: 'MOVE_CARD',
      uid: 'm',
      toZone: 'library',
      toIndex: 0,
    });

    expect(next.zones.library.map((c) => c.uid)).toEqual(['m', 'l']);
  });

  it('reveals a face-down card when it enters the hand', () => {
    const facedown = inst({ uid: 'fd', faceDown: true });
    const next = run(gameState({ library: [facedown] }), {
      type: 'MOVE_CARD',
      uid: 'fd',
      toZone: 'hand',
    });
    expect(next.zones.hand[0].faceDown).toBe(false);
  });

  it('reveals a face-down card when it enters the Reveal Zone', () => {
    // A face-down card in the Reveal Zone would be a contradiction — the whole
    // point of the zone is showing the card to your opponent.
    const facedown = inst({ uid: 'fd', faceDown: true });
    const next = run(gameState({ planI: [facedown] }), {
      type: 'MOVE_CARD',
      uid: 'fd',
      toZone: 'reveal',
    });

    expect(next.zones.planI).toHaveLength(0);
    expect(next.zones.reveal[0].faceDown).toBe(false);
  });

  it('leaves an already face-up card alone entering the Reveal Zone', () => {
    const faceup = inst({ uid: 'fu', tapped: true, counters: 3 });
    const next = run(gameState({ adventureL: [faceup] }), {
      type: 'MOVE_CARD',
      uid: 'fu',
      toZone: 'reveal',
    });

    // Revealing is not a reset — tapped state and counters ride along.
    expect(next.zones.reveal[0]).toMatchObject({
      uid: 'fu',
      faceDown: false,
      tapped: true,
      counters: 3,
    });
  });

  it('is a no-op for an unknown uid', () => {
    const state = gameState({ hand: [inst()] });
    expect(run(state, { type: 'MOVE_CARD', uid: 'nope', toZone: 'retire' })).toBe(state);
  });
});

describe('START_GAME', () => {
  it('deals 4 face-down Plans off the top of the library and reveals one Scene', () => {
    const library = Array.from({ length: 6 }, (_, i) => inst({ uid: `lib-${i}` }));
    const sceneDeck = [inst({ uid: 's0' }), inst({ uid: 's1' })];

    const next = run(gameState({ library, sceneDeck }), { type: 'START_GAME' });

    expect(next.started).toBe(true);
    for (const zone of ['planI', 'planII', 'planIII', 'planIV'] as ZoneId[]) {
      expect(next.zones[zone]).toHaveLength(1);
      expect(next.zones[zone][0].faceDown).toBe(true);
    }
    // 4 cards left the library for Plans.
    expect(next.zones.library.map((c) => c.uid)).toEqual(['lib-4', 'lib-5']);
    // The first Scene is revealed; the rest stay in the deck.
    expect(next.zones.scene.map((c) => c.uid)).toEqual(['s0']);
    expect(next.zones.sceneDeck.map((c) => c.uid)).toEqual(['s1']);
  });

  it('is idempotent once the game has started', () => {
    const state = gameState(
      { library: [inst(), inst(), inst(), inst(), inst()] },
      { started: true }
    );
    expect(run(state, { type: 'START_GAME' })).toBe(state);
  });
});

describe('NEXT_TURN', () => {
  it('untaps every card, reveals a Scene, draws one, and advances the turn', () => {
    const state = gameState(
      {
        adventureC: [inst({ uid: 'tapped', tapped: true })],
        library: [inst({ uid: 'top' }), inst({ uid: 'next' })],
        sceneDeck: [inst({ uid: 'scene-top' })],
      },
      { turn: 3 }
    );

    const next = run(state, { type: 'NEXT_TURN' });

    expect(next.turn).toBe(4);
    expect(next.zones.adventureC[0].tapped).toBe(false);
    expect(next.zones.scene.map((c) => c.uid)).toEqual(['scene-top']);
    expect(next.zones.hand.map((c) => c.uid)).toEqual(['top']);
    expect(next.zones.library.map((c) => c.uid)).toEqual(['next']);
  });

  it('still advances the turn with empty library and scene deck', () => {
    const next = run(gameState({}, { turn: 1 }), { type: 'NEXT_TURN' });
    expect(next.turn).toBe(2);
  });

  it('untaps and reveals but does not draw when the draw is skipped', () => {
    // Shared turn 1: the player on the play skips their draw.
    const state = gameState({
      adventureC: [inst({ uid: 'tapped', tapped: true })],
      library: [inst({ uid: 'top' })],
      sceneDeck: [inst({ uid: 'scene-top' })],
    });

    const next = run(state, { type: 'NEXT_TURN', draw: false });

    expect(next.zones.adventureC[0].tapped).toBe(false);
    expect(next.zones.scene.map((c) => c.uid)).toEqual(['scene-top']);
    expect(next.zones.hand).toEqual([]);
    expect(next.zones.library.map((c) => c.uid)).toEqual(['top']);
  });

  it('draws when the flag is passed explicitly, and by default', () => {
    // Solo never passes the flag at all.
    const board = () => gameState({ library: [inst({ uid: 'top' })] });

    expect(run(board(), { type: 'NEXT_TURN', draw: true }).zones.hand).toHaveLength(1);
    expect(run(board(), { type: 'NEXT_TURN' }).zones.hand).toHaveLength(1);
  });
});

describe('MULLIGAN', () => {
  /** A 5-card hand over a 10-card library, both in known order. */
  function openingBoard(extra: Partial<GameState> = {}) {
    return gameState(
      {
        hand: Array.from({ length: 5 }, (_, i) => inst({ uid: `h${i}` })),
        library: Array.from({ length: 10 }, (_, i) => inst({ uid: `l${i}` })),
      },
      extra
    );
  }

  // Rules 103.4.1a. The absence of a shuffle is the whole rule, so this asserts
  // exact order rather than set membership. The old redraw reshuffled, which let
  // a mulliganed card come straight back.
  it('puts the hand on the bottom in order and deals the new one off the top', () => {
    const next = run(openingBoard(), { type: 'MULLIGAN' });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4']);
    expect(next.zones.library.map((c) => c.uid)).toEqual([
      'l5',
      'l6',
      'l7',
      'l8',
      'l9',
      'h0',
      'h1',
      'h2',
      'h3',
      'h4',
    ]);
  });

  it('never deals a mulliganed card back into the new hand', () => {
    const next = run(openingBoard(), { type: 'MULLIGAN' });
    expect(next.zones.hand.some((c) => c.uid.startsWith('h'))).toBe(false);
  });

  it('marks the mulligan spent', () => {
    expect(run(openingBoard(), { type: 'MULLIGAN' }).mulliganed).toBe(true);
  });

  // Rules 103.4.1c, one per game. Without this the button was a free dig.
  it('is a no-op on a second mulligan', () => {
    const once = run(openingBoard(), { type: 'MULLIGAN' });
    expect(run(once, { type: 'MULLIGAN' })).toBe(once);
  });

  it('is a no-op after the game has started', () => {
    const state = openingBoard({ started: true });
    expect(run(state, { type: 'MULLIGAN' })).toBe(state);
  });

  // A short library is legal (nothing says the deck must outnumber the hand), and
  // the bottomed cards are simply reachable again because the deck ran out first.
  it('still refills a hand larger than the remaining library', () => {
    const state = gameState({
      hand: [inst({ uid: 'h0' }), inst({ uid: 'h1' }), inst({ uid: 'h2' })],
      library: [inst({ uid: 'l0' })],
    });

    const next = run(state, { type: 'MULLIGAN' });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['l0', 'h0', 'h1']);
    expect(next.zones.library.map((c) => c.uid)).toEqual(['h2']);
  });

  it('clears the spent mulligan on a fresh deal', () => {
    const deck: Deck = {
      code: 'test',
      name: 'Test',
      main_character: null,
      cards: [{ card: card(), zone: 'main', quantity: 12 }],
      tokens: [],
    };
    const { result } = renderHook(() => useGame(deck));

    act(() => result.current.dispatch({ type: 'MULLIGAN' }));
    expect(result.current.state.mulliganed).toBe(true);

    // RESTART rebuilds from initialState, so the cap is per game, not per hand.
    act(() => result.current.dispatch({ type: 'RESTART' }));
    expect(result.current.state.mulliganed).toBe(false);
  });
});

describe('per-card mutations', () => {
  it('toggles tap and flip', () => {
    const state = gameState({ adventureC: [inst({ uid: 'c' })] });
    expect(run(state, { type: 'TAP', uid: 'c' }).zones.adventureC[0].tapped).toBe(true);
    expect(run(state, { type: 'FLIP', uid: 'c' }).zones.adventureC[0].faceDown).toBe(true);
  });

  it('bumps inspiration off the printed value when no override is set', () => {
    const state = gameState({ adventureC: [inst({ uid: 'c', card: card({ inspiration: 4 }) })] });
    const next = run(state, { type: 'BUMP_INSPIRATION', uid: 'c', delta: 1 });
    expect(next.zones.adventureC[0].inspiration).toBe(5);
  });

  it('sets and resets the inspiration override', () => {
    const state = gameState({ adventureC: [inst({ uid: 'c' })] });
    const set = run(state, { type: 'SET_INSPIRATION', uids: ['c'], value: 9 });
    expect(set.zones.adventureC[0].inspiration).toBe(9);
    expect(
      run(set, { type: 'SET_INSPIRATION', uids: ['c'], value: null }).zones.adventureC[0]
        .inspiration
    ).toBeNull();
  });

  it('adds, removes (clamped at zero), and resets counters', () => {
    const state = gameState({ adventureC: [inst({ uid: 'c' })] });
    const one = run(state, { type: 'ADD_COUNTER', uid: 'c' });
    expect(one.zones.adventureC[0].counters).toBe(1);
    // Removing below zero clamps.
    expect(run(state, { type: 'REMOVE_COUNTER', uid: 'c' }).zones.adventureC[0].counters).toBe(0);
    const three = run(run(one, { type: 'ADD_COUNTER', uid: 'c' }), {
      type: 'ADD_COUNTER',
      uid: 'c',
    });
    expect(run(three, { type: 'RESET_COUNTERS', uid: 'c' }).zones.adventureC[0].counters).toBe(0);
  });
});

describe('TUTOR', () => {
  it('pulls a card to hand and keeps the library intact (minus the pulled card)', () => {
    const target = inst({ uid: 't' });
    const library = [inst({ uid: 'l0' }), target, inst({ uid: 'l1' })];

    const next = run(gameState({ library }), { type: 'TUTOR', uid: 't', toZone: 'hand' });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['t']);
    expect(next.zones.library.map((c) => c.uid).sort()).toEqual(['l0', 'l1']);
  });

  it('places a tutored card on top of the library', () => {
    const target = inst({ uid: 't' });
    const next = run(gameState({ retire: [target], library: [inst({ uid: 'l0' })] }), {
      type: 'TUTOR',
      uid: 't',
      toZone: 'library',
      toTop: true,
    });
    expect(next.zones.library[0].uid).toBe('t');
  });

  it('pulling a Scene from the Scene Deck leaves the Library untouched', () => {
    const target = inst({ uid: 's' });
    const library = [inst({ uid: 'l0' }), inst({ uid: 'l1' })];
    const next = run(gameState({ sceneDeck: [target, inst({ uid: 's1' })], library }), {
      type: 'TUTOR',
      uid: 's',
      toZone: 'scene',
    });

    expect(next.zones.scene.map((c) => c.uid)).toEqual(['s']);
    expect(next.zones.sceneDeck.map((c) => c.uid)).toEqual(['s1']);
    // The Scene Deck is the source, so only it reshuffles — the Library is not disturbed.
    expect(next.zones.library.map((c) => c.uid)).toEqual(['l0', 'l1']);
  });

  it('pulling a public card from Retire reshuffles nothing', () => {
    const target = inst({ uid: 'r' });
    const library = [inst({ uid: 'l0' }), inst({ uid: 'l1' })];
    const next = run(gameState({ retire: [target], library }), {
      type: 'TUTOR',
      uid: 'r',
      toZone: 'hand',
    });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['r']);
    expect(next.zones.library.map((c) => c.uid)).toEqual(['l0', 'l1']);
  });
});

describe('TO_PLAN', () => {
  it('fills the highest-numbered free slot first (refills run IV→I)', () => {
    const next = run(gameState({ hand: [inst({ uid: 'h' })] }), { type: 'TO_PLAN', uid: 'h' });

    expect(next.zones.planIV.map((c) => c.uid)).toEqual(['h']);
    expect(next.zones.planI).toHaveLength(0);
  });

  it('walks down the slots as they fill', () => {
    let state = gameState({ hand: [inst({ uid: 'a' }), inst({ uid: 'b' }), inst({ uid: 'c' })] });
    state = run(state, { type: 'TO_PLAN', uid: 'a' });
    state = run(state, { type: 'TO_PLAN', uid: 'b' });
    state = run(state, { type: 'TO_PLAN', uid: 'c' });

    expect(state.zones.planIV.map((c) => c.uid)).toEqual(['a']);
    expect(state.zones.planIII.map((c) => c.uid)).toEqual(['b']);
    expect(state.zones.planII.map((c) => c.uid)).toEqual(['c']);
    expect(state.zones.planI).toHaveLength(0);
  });

  it('skips occupied slots rather than stacking', () => {
    const state = gameState({
      hand: [inst({ uid: 'h' })],
      planIV: [inst({ uid: 'existing' })],
    });
    const next = run(state, { type: 'TO_PLAN', uid: 'h' });

    expect(next.zones.planIV.map((c) => c.uid)).toEqual(['existing']);
    expect(next.zones.planIII.map((c) => c.uid)).toEqual(['h']);
  });

  it('lands the card face down, whether it came from hand or the deck', () => {
    const fromHand = run(gameState({ hand: [inst({ uid: 'h' })] }), { type: 'TO_PLAN', uid: 'h' });
    const fromDeck = run(gameState({ library: [inst({ uid: 'l' })] }), {
      type: 'TO_PLAN',
      uid: 'l',
    });

    expect(fromHand.zones.planIV[0].faceDown).toBe(true);
    expect(fromDeck.zones.planIV[0].faceDown).toBe(true);
  });

  it('is a no-op when all four Plan slots are full', () => {
    const state = gameState({
      hand: [inst({ uid: 'h' })],
      planI: [inst()],
      planII: [inst()],
      planIII: [inst()],
      planIV: [inst()],
    });

    expect(run(state, { type: 'TO_PLAN', uid: 'h' })).toBe(state);
  });
});

describe('nextPlanSlot', () => {
  it('returns null once every slot is occupied', () => {
    const state = gameState({
      planI: [inst()],
      planII: [inst()],
      planIII: [inst()],
      planIV: [inst()],
    });

    expect(nextPlanSlot(state.zones)).toBeNull();
  });

  it('returns planIV on an empty board', () => {
    expect(nextPlanSlot(gameState({}).zones)).toBe('planIV');
  });
});

describe('rendersLandscape', () => {
  it('stands a Plan up when it is face up and lays it flat when face down', () => {
    // The slot is horizontal but the art is not: face down the card lies in the
    // slot, face up it stands so you can read it.
    expect(rendersLandscape('planII', true)).toBe(true);
    expect(rendersLandscape('planII', false)).toBe(false);
  });

  it('keeps Story cards landscape regardless of face', () => {
    expect(rendersLandscape('storyI', true)).toBe(true);
    expect(rendersLandscape('storyI', false)).toBe(true);
  });

  it('keeps the Main Character portrait even on a Story stage', () => {
    expect(rendersLandscape('storyIII', false, 'main-character')).toBe(false);
  });

  it('leaves ordinary zones portrait', () => {
    expect(rendersLandscape('hand', false)).toBe(false);
    expect(rendersLandscape('adventureL', false)).toBe(false);
    expect(rendersLandscape('reveal', false)).toBe(false);
  });
});

describe('going first', () => {
  const withScene = (goingFirst: boolean | null) =>
    gameState({ sceneDeck: [inst({ uid: 's0' }), inst({ uid: 's1' })] }, { goingFirst });

  it('deals the first player their opening Scene face down', () => {
    const next = run(withScene(true), { type: 'START_GAME' });

    expect(next.zones.scene.map((c) => c.uid)).toEqual(['s0']);
    expect(next.zones.scene[0].faceDown).toBe(true);
  });

  it('deals the second player their opening Scene face up', () => {
    expect(run(withScene(false), { type: 'START_GAME' }).zones.scene[0].faceDown).toBe(false);
  });

  it('defaults to face up when nobody has chosen', () => {
    expect(run(withScene(null), { type: 'START_GAME' }).zones.scene[0].faceDown).toBe(false);
  });

  it('does not suppress any draw — the turn-1 draw stays manual', () => {
    // Deliberately not a rules engine: the only mechanical difference between
    // going first and going second is the Scene's face.
    const first = run(withScene(true), { type: 'START_GAME' });
    const second = run(withScene(false), { type: 'START_GAME' });

    expect(first.zones.hand).toHaveLength(second.zones.hand.length);
    expect(first.zones.library).toHaveLength(second.zones.library.length);
  });

  it('records the choice before the game starts', () => {
    const next = run(gameState({}), { type: 'SET_GOING_FIRST', goingFirst: true });
    expect(next.goingFirst).toBe(true);
  });

  it('locks the choice once the board is dealt', () => {
    const started = gameState({}, { started: true, goingFirst: false });
    expect(run(started, { type: 'SET_GOING_FIRST', goingFirst: true })).toBe(started);
  });

  it('carries the seat across a RESTART (nothing re-pushes it)', () => {
    const deck: Deck = {
      code: 'test',
      name: 'Test',
      main_character: null,
      cards: [],
      tokens: [],
    };
    const { result } = renderHook(() => useGame(deck));

    act(() => result.current.dispatch({ type: 'SET_GOING_FIRST', goingFirst: true }));
    expect(result.current.state.goingFirst).toBe(true);

    act(() => result.current.dispatch({ type: 'RESTART' }));
    // A fresh board, but still on the play — otherwise Start Game deals the
    // first player's opening Scene face up.
    expect(result.current.state.started).toBe(false);
    expect(result.current.state.goingFirst).toBe(true);
  });
});

describe('send to top of deck', () => {
  it('puts the card on top, where the next draw takes it from', () => {
    const state = gameState({
      hand: [inst({ uid: 'h' })],
      library: [inst({ uid: 'l0' }), inst({ uid: 'l1' })],
    });
    const next = run(state, { type: 'MOVE_CARD', uid: 'h', toZone: 'library', toIndex: 0 });

    expect(next.zones.library.map((c) => c.uid)).toEqual(['h', 'l0', 'l1']);
    // The round trip proves "top" really is what a draw picks up.
    expect(run(next, { type: 'DRAW', n: 1 }).zones.hand.map((c) => c.uid)).toEqual(['h']);
  });

  it('sends to the bottom when no index is given', () => {
    const state = gameState({ hand: [inst({ uid: 'h' })], library: [inst({ uid: 'l0' })] });
    const next = run(state, { type: 'MOVE_CARD', uid: 'h', toZone: 'library' });

    expect(next.zones.library.map((c) => c.uid)).toEqual(['l0', 'h']);
  });
});

describe('returning a card to hand', () => {
  it('turns a face-down Plan face up on the way in', () => {
    const state = gameState({ planIV: [inst({ uid: 'p', faceDown: true })] });
    const next = run(state, { type: 'MOVE_CARD', uid: 'p', toZone: 'hand' });

    expect(next.zones.planIV).toHaveLength(0);
    expect(next.zones.hand[0]).toMatchObject({ uid: 'p', faceDown: false });
  });

  it('picks a card back up out of the Reveal Zone', () => {
    const state = gameState({ reveal: [inst({ uid: 'shown' })] });
    const next = run(state, { type: 'MOVE_CARD', uid: 'shown', toZone: 'hand' });

    expect(next.zones.reveal).toHaveLength(0);
    expect(next.zones.hand.map((c) => c.uid)).toEqual(['shown']);
  });
});

describe('laneNumber', () => {
  it('numbers the first player left→right', () => {
    expect(laneNumber('adventureL', true)).toBe(1);
    expect(laneNumber('adventureC', true)).toBe(2);
    expect(laneNumber('adventureR', true)).toBe(3);
  });

  it('reverses the numbering for the second player', () => {
    // Contact sweeps from their rightmost lane, so that lane is Lane 1.
    expect(laneNumber('adventureL', false)).toBe(3);
    expect(laneNumber('adventureC', false)).toBe(2);
    expect(laneNumber('adventureR', false)).toBe(1);
  });

  it('defaults to first-player numbering when the seat is undecided', () => {
    expect(laneNumber('adventureL', null)).toBe(1);
    expect(laneNumber('adventureR', null)).toBe(3);
  });

  it('facing lanes across the table always share a number', () => {
    // adventureL faces the opponent's adventureR (physical column alignment).
    // First vs second player means they sweep toward each other, so the numbers
    // meet: my Lane 1 opposes their Lane 1.
    expect(laneNumber('adventureL', true)).toBe(laneNumber('adventureR', false));
    expect(laneNumber('adventureR', true)).toBe(laneNumber('adventureL', false));
  });

  it('is null for non-lane zones', () => {
    expect(laneNumber('hand', true)).toBeNull();
    expect(laneNumber('scene', false)).toBeNull();
  });
});

describe('laneZoneForNumber', () => {
  it('is the exact inverse of laneNumber for both seats', () => {
    for (const goingFirst of [true, false, null]) {
      for (const zone of ADVENTURE_ZONES) {
        const n = laneNumber(zone, goingFirst)!;
        expect(laneZoneForNumber(n, goingFirst)).toBe(zone);
      }
    }
  });

  it('is null for a number that names no lane', () => {
    expect(laneZoneForNumber(0, true)).toBeNull();
    expect(laneZoneForNumber(4, false)).toBeNull();
  });
});

describe('PROMOTE_STAGE', () => {
  const mainChar = () => inst({ uid: 'mc', card: card({ subtype: 'main-character' }) });

  it('walks the Main Character from its rail up through the four stages', () => {
    let state = gameState({ mainChar: [mainChar()] });
    const route: ZoneId[] = ['storyI', 'storyII', 'storyIII', 'storyIV'];

    for (const stage of route) {
      state = run(state, { type: 'PROMOTE_STAGE' });
      expect(state.zones[stage].map((c) => c.uid)).toEqual(['mc']);
    }
    expect(state.zones.mainChar).toHaveLength(0);
  });

  it('leaves a Story card already on the stage in place', () => {
    const story = inst({ uid: 'story-1', card: card({ subtype: 'story' }) });
    const state = run(gameState({ mainChar: [mainChar()], storyI: [story] }), {
      type: 'PROMOTE_STAGE',
    });
    expect(state.zones.storyI.map((c) => c.uid)).toEqual(['story-1', 'mc']);
  });

  it('does nothing once the Main Character is on Stage IV', () => {
    const state = gameState({ storyIV: [mainChar()] });
    expect(run(state, { type: 'PROMOTE_STAGE' })).toBe(state);
  });

  it('does nothing when there is no Main Character on the board', () => {
    const state = gameState({ hand: [inst()] });
    expect(run(state, { type: 'PROMOTE_STAGE' })).toBe(state);
  });

  it('carries the card state along rather than resetting it', () => {
    // The board enforces no rules, so promoting must not silently untap.
    const tapped = inst({ uid: 'mc', card: card({ subtype: 'main-character' }), tapped: true });
    const state = run(gameState({ storyII: [tapped] }), { type: 'PROMOTE_STAGE' });
    expect(state.zones.storyIII[0]).toMatchObject({ uid: 'mc', tapped: true });
  });
});

describe('promotionTarget', () => {
  it('reports the next stage, and null once at the top', () => {
    const mc = inst({ card: card({ subtype: 'main-character' }) });
    expect(promotionTarget(gameState({ mainChar: [mc] }).zones)).toMatchObject({
      from: 'mainChar',
      to: 'storyI',
    });
    expect(promotionTarget(gameState({ storyIV: [mc] }).zones)).toMatchObject({
      from: 'storyIV',
      to: null,
    });
  });

  it('is null when no Main Character sits anywhere on the chain', () => {
    // A Main Character parked in the Retire pile is off the route entirely.
    const mc = inst({ card: card({ subtype: 'main-character' }) });
    expect(promotionTarget(gameState({ retire: [mc] }).zones)).toBeNull();
  });
});

describe('SPAWN_TOKEN / REMOVE_CARD', () => {
  const candy = card({ name: 'Candy', subtype: 'token', card_number: 'TK01', rarity: 'TK' });

  it('appends the token behind whatever is already in the lane', () => {
    const character = inst({ uid: 'char' });
    const next = run(gameState({ adventureC: [character] }), {
      type: 'SPAWN_TOKEN',
      card: candy,
      toZone: 'adventureC',
    });

    expect(next.zones.adventureC.map((c) => c.card.name)).toEqual(['Test Card', 'Candy']);
    // Face up, untapped, its own uid: a fresh copy like any other card instance.
    expect(next.zones.adventureC[1]).toMatchObject({ tapped: false, faceDown: false, counters: 0 });
    expect(next.zones.adventureC[1].uid).not.toBe('char');
  });

  it('spawns a second copy rather than replacing the first (no rules enforcement)', () => {
    const once = run(gameState({ adventureL: [inst()] }), {
      type: 'SPAWN_TOKEN',
      card: candy,
      toZone: 'adventureL',
    });
    const twice = run(once, { type: 'SPAWN_TOKEN', card: candy, toZone: 'adventureL' });

    expect(twice.zones.adventureL).toHaveLength(3);
  });

  it('removes a card from the board entirely, not to the Retire pile', () => {
    const token = inst({ uid: 'tok', card: candy });
    const next = run(gameState({ adventureR: [inst({ uid: 'char' }), token] }), {
      type: 'REMOVE_CARD',
      uid: 'tok',
    });

    expect(next.zones.adventureR.map((c) => c.uid)).toEqual(['char']);
    expect(next.zones.retire).toHaveLength(0);
  });

  it('is a no-op for a uid that is not on the board', () => {
    const state = gameState({ adventureR: [inst({ uid: 'char' })] });
    expect(run(state, { type: 'REMOVE_CARD', uid: 'nope' })).toBe(state);
  });
});

describe('MOVE_CARDS', () => {
  it('gathers cards from several zones into one, in board order', () => {
    const state = gameState({
      scene: [inst({ uid: 's1' }), inst({ uid: 's2' })],
      adventureL: [inst({ uid: 'a1' })],
    });
    const next = run(state, { type: 'MOVE_CARDS', uids: ['s2', 'a1', 's1'], toZone: 'retire' });

    // Board order (ALL_ZONES puts the lanes before the Scene Zone), not the
    // order the selection happened to be built in.
    expect(next.zones.retire.map((c) => c.uid)).toEqual(['a1', 's1', 's2']);
    expect(next.zones.scene).toHaveLength(0);
    expect(next.zones.adventureL).toHaveLength(0);
  });

  it('drops the group in as a contiguous block at toIndex', () => {
    const state = gameState({
      hand: [inst({ uid: 'h1' }), inst({ uid: 'h2' }), inst({ uid: 'h3' })],
      scene: [inst({ uid: 's1' }), inst({ uid: 's2' })],
    });
    const next = run(state, { type: 'MOVE_CARDS', uids: ['s1', 's2'], toZone: 'hand', toIndex: 1 });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['h1', 's1', 's2', 'h2', 'h3']);
  });

  it('reads toIndex against the hand the moved cards have already left', () => {
    // The board measures the drop slot with the dragged cards skipped, so a
    // reorder inside the hand has to remove before it inserts.
    const state = gameState({
      hand: [inst({ uid: 'h1' }), inst({ uid: 'h2' }), inst({ uid: 'h3' })],
    });
    const next = run(state, { type: 'MOVE_CARDS', uids: ['h1'], toZone: 'hand', toIndex: 2 });

    expect(next.zones.hand.map((c) => c.uid)).toEqual(['h2', 'h3', 'h1']);
  });

  it('turns a face-down card face up on entering the hand', () => {
    const state = gameState({ planI: [inst({ uid: 'p', faceDown: true })] });
    const next = run(state, { type: 'MOVE_CARDS', uids: ['p'], toZone: 'hand' });

    expect(next.zones.hand[0].faceDown).toBe(false);
  });

  it('is a no-op when none of the uids are on the board', () => {
    const state = gameState({ hand: [inst({ uid: 'h1' })] });
    expect(run(state, { type: 'MOVE_CARDS', uids: ['nope'], toZone: 'retire' })).toBe(state);
  });
});

describe('SET_TAPPED / SET_FACE_DOWN', () => {
  it('levels a mixed group to the value asked for rather than toggling each', () => {
    const state = gameState({
      scene: [inst({ uid: 's1', tapped: true }), inst({ uid: 's2' }), inst({ uid: 's3' })],
    });
    const next = run(state, { type: 'SET_TAPPED', uids: ['s1', 's2', 's3'], tapped: true });

    expect(next.zones.scene.map((c) => c.tapped)).toEqual([true, true, true]);
  });

  it('unsets the whole group too', () => {
    const state = gameState({
      scene: [inst({ uid: 's1', tapped: true }), inst({ uid: 's2', tapped: true })],
    });
    const next = run(state, { type: 'SET_TAPPED', uids: ['s1', 's2'], tapped: false });

    expect(next.zones.scene.map((c) => c.tapped)).toEqual([false, false]);
  });

  it('leaves cards outside the group alone', () => {
    const state = gameState({
      scene: [inst({ uid: 's1' }), inst({ uid: 's2' })],
    });
    const next = run(state, { type: 'SET_FACE_DOWN', uids: ['s1'], faceDown: true });

    expect(next.zones.scene.map((c) => c.faceDown)).toEqual([true, false]);
  });

  it('reaches cards across zones', () => {
    const state = gameState({
      adventureL: [inst({ uid: 'a' })],
      scene: [inst({ uid: 's' })],
    });
    const next = run(state, { type: 'SET_TAPPED', uids: ['a', 's'], tapped: true });

    expect(next.zones.adventureL[0].tapped).toBe(true);
    expect(next.zones.scene[0].tapped).toBe(true);
  });
});

describe('SET_INSPIRATION', () => {
  it('resets a whole group to its printed value', () => {
    const state = gameState({
      adventureL: [inst({ uid: 'a', inspiration: 7 })],
      adventureC: [inst({ uid: 'b', inspiration: 9 })],
    });
    const next = run(state, { type: 'SET_INSPIRATION', uids: ['a', 'b'], value: null });

    expect(next.zones.adventureL[0].inspiration).toBeNull();
    expect(next.zones.adventureC[0].inspiration).toBeNull();
  });
});
