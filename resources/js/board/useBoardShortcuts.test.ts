import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card } from '@/types/cards';
import { isTypingTarget, MENU_HINTS, SHORTCUTS } from './shortcuts';
import { emptyZones } from './setup';
import { CardInstance, GameState, ZoneId } from './types';
import { resolveTargets, useBoardShortcuts } from './useBoardShortcuts';

/**
 * Ported from PonyRec's `useBoardShortcuts.test.ts`. The `v` (View card) and
 * Shift+Space (step back) cases are gone with their bindings — see the hook.
 */

function inst(uid: string, subtype = 'character'): CardInstance {
  return {
    uid,
    card: { name: 'Test Card', subtype } as Card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

function gameState(zones: Partial<Record<ZoneId, CardInstance[]>> = {}): GameState {
  return {
    zones: { ...emptyZones(), ...zones },
    turn: 1,
    started: true,
    goingFirst: null,
    mulliganed: false,
  };
}

/** Mount the hook with spies for every action, overridable per test. */
function setup(overrides: Partial<Parameters<typeof useBoardShortcuts>[0]> = {}) {
  const spies = {
    dispatch: vi.fn(),
    onDraw: vi.fn(),
    onNextTurn: vi.fn(),
    onRevealScene: vi.fn(),
    onTopCardToPlan: vi.fn(),
    onPromoteStage: vi.fn(),
    onToggleHelp: vi.fn(),
  };
  const options = {
    state: gameState({ adventureL: [inst('card-1')] }),
    hovered: null,
    selected: null,
    enabled: true,
    ...spies,
    ...overrides,
  };
  renderHook(() => useBoardShortcuts(options));
  return spies;
}

/** Dispatch a keydown on the window, as the hook listens there. */
function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => vi.clearAllMocks());

describe('useBoardShortcuts', () => {
  it('taps the hovered card with t', () => {
    const { dispatch } = setup({ hovered: 'card-1' });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TAPPED', uids: ['card-1'], tapped: true });
  });

  it('falls back to the selected card when nothing is hovered', () => {
    const { dispatch } = setup({ selected: 'card-1' });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TAPPED', uids: ['card-1'], tapped: true });
  });

  it('prefers the hovered card over the selected one', () => {
    const state = gameState({ adventureL: [inst('hovered')], hand: [inst('selected')] });
    const { dispatch } = setup({ state, hovered: 'hovered', selected: 'selected' });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TAPPED', uids: ['hovered'], tapped: true });
  });

  it('flips the target card with f', () => {
    const { dispatch } = setup({ hovered: 'card-1' });
    press('f');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FACE_DOWN',
      uids: ['card-1'],
      faceDown: true,
    });
  });

  it('does nothing for card keys when no card is hovered or selected', () => {
    const { dispatch } = setup();
    press('t');
    press('f');
    press('r');
    press('h');
    press('1');
    press('z');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('retires a card in an Adventure lane with r', () => {
    // The default state seats card-1 in adventureL. Nothing in a lane is
    // hidden, so `r` spends itself on the action a lane actually wants.
    const { dispatch } = setup({ hovered: 'card-1' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['card-1'],
      toZone: 'retire',
    });
  });

  it('still reveals from a Story stage, where the lane rule does not apply', () => {
    const state = gameState({ storyII: [inst('on-stage')] });
    const { dispatch } = setup({ state, hovered: 'on-stage' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['on-stage'],
      toZone: 'reveal',
    });
  });

  it('reveals a hand card with r', () => {
    const state = gameState({ hand: [inst('in-hand')] });
    const { dispatch } = setup({ state, hovered: 'in-hand' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['in-hand'],
      toZone: 'reveal',
    });
  });

  it('returns the target card to hand with h', () => {
    const { dispatch } = setup({ hovered: 'card-1' });
    press('h');
    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_CARDS', uids: ['card-1'], toZone: 'hand' });
  });

  it('ignores h for a card already in hand', () => {
    const state = gameState({ hand: [inst('held')] });
    const { dispatch } = setup({ state, hovered: 'held' });
    press('h');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('retires a card already in the Reveal Zone with r', () => {
    // It has finished being shown, so the Retire pile is the only place left
    // for `r` to send it.
    const state = gameState({ reveal: [inst('shown')] });
    const { dispatch } = setup({ state, hovered: 'shown' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['shown'],
      toZone: 'retire',
    });
  });

  it('takes a token off the board with r rather than retiring it', () => {
    // A token was never in the decklist, so the Retire pile is the wrong place
    // for it. The keyboard matches the card menu's "Remove token" row.
    const state = gameState({ adventureL: [inst('candy', 'token')] });
    const { dispatch } = setup({ state, hovered: 'candy' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_CARD', uid: 'candy' });
  });

  it('ignores h for a token, which has no hand to return to', () => {
    const state = gameState({ adventureL: [inst('candy', 'token')] });
    const { dispatch } = setup({ state, hovered: 'candy' });
    press('h');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves a token alone for the keys that change board state', () => {
    // Candy is never tapped, never turned face down, and has no Inspiration to
    // reset. The card menu offers none of those rows either.
    const state = gameState({ adventureL: [inst('candy', 'token')] });
    const { dispatch } = setup({ state, hovered: 'candy' });
    press('t');
    press('f');
    press('z');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still moves a token between lanes with 1 / 2 / 3', () => {
    // Dragging a token onto another lane is deliberately allowed, so the keyboard
    // equivalent stays too.
    const state = gameState({ adventureL: [inst('candy', 'token')] });
    const { dispatch } = setup({ state, hovered: 'candy' });
    press('3');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['candy'],
      toZone: 'adventureR',
    });
  });

  it('reveals the top card of the deck when the pile reports it as hovered', () => {
    const state = gameState({ library: [inst('top-card')] });
    const { dispatch } = setup({ state, hovered: 'top-card' });
    press('r');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['top-card'],
      toZone: 'reveal',
    });
  });

  it('plays the target card into the numbered lane with 1 / 2 / 3', () => {
    const state = gameState({ hand: [inst('in-hand')] });
    const { dispatch } = setup({ state, hovered: 'in-hand' });
    press('2');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['in-hand'],
      toZone: 'adventureC',
    });
  });

  it('numbers the lanes by contact order, which reverses on the draw', () => {
    // Going second, Lane 1 is the rightmost lane, so `1` must not land left.
    const state = { ...gameState({ hand: [inst('in-hand')] }), goingFirst: false };
    const { dispatch } = setup({ state, hovered: 'in-hand' });
    press('1');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['in-hand'],
      toZone: 'adventureR',
    });
  });

  it('ignores a lane key for a card already in that lane', () => {
    // The default state seats card-1 in adventureL, which is Lane 1.
    const { dispatch } = setup({ hovered: 'card-1' });
    press('1');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('resets the target card to its printed inspiration with z', () => {
    const { dispatch } = setup({ hovered: 'card-1' });
    press('z');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INSPIRATION',
      uids: ['card-1'],
      value: null,
    });
  });

  it('runs the board actions regardless of hover', () => {
    const { onDraw, onRevealScene, onTopCardToPlan, onPromoteStage, onToggleHelp } = setup();
    press('d');
    press('s');
    press('p');
    press('x');
    press('?');
    expect(onDraw).toHaveBeenCalledOnce();
    expect(onRevealScene).toHaveBeenCalledOnce();
    expect(onTopCardToPlan).toHaveBeenCalledOnce();
    expect(onPromoteStage).toHaveBeenCalledOnce();
    expect(onToggleHelp).toHaveBeenCalledOnce();
  });

  it('advances the turn on space and suppresses the page scroll', () => {
    const { onNextTurn } = setup();
    const event = press(' ', { code: 'Space' });
    expect(onNextTurn).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Shift+Space advancing the turn, since nothing steps back yet', () => {
    // The shared turn cursor arrives with the turn-order slice, and Shift+Space
    // is the binding that will walk it back. Until then the modifier is ignored
    // rather than swallowed.
    const { onNextTurn } = setup();

    press(' ', { code: 'Space', shiftKey: true });

    expect(onNextTurn).toHaveBeenCalledOnce();
  });

  it('ignores keys carrying a modifier so browser shortcuts still work', () => {
    const { onDraw, dispatch } = setup({ hovered: 'card-1' });
    press('d', { metaKey: true });
    press('t', { ctrlKey: true });
    expect(onDraw).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing at all when disabled by an open modal', () => {
    const { onDraw, onNextTurn, dispatch } = setup({ hovered: 'card-1', enabled: false });
    press('d');
    press(' ', { code: 'Space' });
    press('t');
    expect(onDraw).not.toHaveBeenCalled();
    expect(onNextTurn).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves a card in the Retire pile alone for the keys that change board state', () => {
    // It is out of play: tapping it, turning it face down or resetting its
    // inspiration means nothing, and the card menu offers no rows for them
    // either. The two have to agree.
    const { dispatch } = setup({
      state: gameState({ retire: [inst('card-1')] }),
      hovered: 'card-1',
    });

    press('t');
    press('f');
    press('z');

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still moves a card out of the Retire pile', () => {
    // The half that does make sense there, and the reason the pile is worth
    // opening at all.
    const { dispatch } = setup({
      state: gameState({ retire: [inst('card-1')] }),
      hovered: 'card-1',
    });

    press('h');
    press('1');

    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_CARDS', uids: ['card-1'], toZone: 'hand' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['card-1'],
      toZone: 'adventureL',
    });
  });

  it('keeps the card bindings alive for a pile viewer', () => {
    // The Retire viewer's rows are real cards, so hovering one and pressing `h`
    // has to pull it back to hand the same way the board does.
    const { dispatch } = setup({ hovered: 'card-1', scope: 'card' });

    press('h');

    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_CARDS', uids: ['card-1'], toZone: 'hand' });
  });

  it('drops the board bindings for a pile viewer', () => {
    // Reading through a pile is not a moment anyone means to draw a card, page
    // the turn, or open the help overlay.
    const { onDraw, onNextTurn, onRevealScene, onPromoteStage, onTopCardToPlan, onToggleHelp } =
      setup({ hovered: 'card-1', scope: 'card' });

    press('d');
    press('s');
    press('x');
    press('p');
    press('?');
    press(' ', { code: 'Space' });

    expect(onDraw).not.toHaveBeenCalled();
    expect(onNextTurn).not.toHaveBeenCalled();
    expect(onRevealScene).not.toHaveBeenCalled();
    expect(onPromoteStage).not.toHaveBeenCalled();
    expect(onTopCardToPlan).not.toHaveBeenCalled();
    expect(onToggleHelp).not.toHaveBeenCalled();
  });

  it('leaves space to the page while a pile viewer is open', () => {
    // Space still scrolls a long viewer list, which is what it should do there.
    setup({ hovered: 'card-1', scope: 'card' });

    expect(press(' ', { code: 'Space' }).defaultPrevented).toBe(false);
  });

  it('ignores keystrokes aimed at a text field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { onDraw } = setup();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));

    expect(onDraw).not.toHaveBeenCalled();
    input.remove();
  });
});

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('treats %s as a typing target', (tag) => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true);
  });

  it('treats a contenteditable element as a typing target', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it('leaves ordinary elements and null alone', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('shortcut tables', () => {
  it('documents every key the handler implements', () => {
    // Guards the promise that SHORTCUTS is the single source of truth: a
    // binding added to the hook must be listed for the help overlay too.
    const listed = SHORTCUTS.map((s) => s.key);
    expect(listed).toEqual(
      expect.arrayContaining([
        't',
        'f',
        'r',
        'h',
        '1 2 3',
        'z',
        'x',
        'p',
        'Space',
        'd',
        's',
        '?',
        'Esc',
      ])
    );
  });

  it('only hints keys that are real bindings', () => {
    const listed = SHORTCUTS.map((s) => s.key);
    Object.values(MENU_HINTS).forEach((key) => expect(listed).toContain(key));
  });
});

describe('a marquee selection', () => {
  /** Three Scenes, the row this feature exists for, plus a card outside it. */
  function sceneRow(overrides: Partial<CardInstance>[] = [{}, {}, {}]) {
    return gameState({
      scene: overrides.map((o, i) => ({ ...inst(`s${i + 1}`, 'scene'), ...o })),
      hand: [inst('in-hand')],
    });
  }

  const three = new Set(['s1', 's2', 's3']);

  it('taps the whole selection with one press of t', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TAPPED',
      uids: ['s1', 's2', 's3'],
      tapped: true,
    });
  });

  it('levels a mixed selection by tapping, rather than toggling each card', () => {
    const state = sceneRow([{ tapped: true }, {}, {}]);
    const { dispatch } = setup({ state, selection: three });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TAPPED',
      uids: ['s1', 's2', 's3'],
      tapped: true,
    });
  });

  it('untaps only once every card in the selection is tapped', () => {
    const state = sceneRow([{ tapped: true }, { tapped: true }, { tapped: true }]);
    const { dispatch } = setup({ state, selection: three });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TAPPED',
      uids: ['s1', 's2', 's3'],
      tapped: false,
    });
  });

  it('flips the whole selection with one press of f', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three });
    press('f');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_FACE_DOWN',
      uids: ['s1', 's2', 's3'],
      faceDown: true,
    });
  });

  it('acts on the selection while the cursor is over one of its own cards', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three, hovered: 's2' });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TAPPED',
      uids: ['s1', 's2', 's3'],
      tapped: true,
    });
  });

  it('lets the cursor override the selection when it names a card outside it', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three, hovered: 'in-hand' });
    press('t');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TAPPED',
      uids: ['in-hand'],
      tapped: true,
    });
  });

  it('moves the whole selection to a lane as one action', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three });
    press('2');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['s1', 's2', 's3'],
      toZone: 'adventureC',
    });
  });

  it('returns the whole selection to hand with h', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three });
    press('h');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['s1', 's2', 's3'],
      toZone: 'hand',
    });
  });

  it('splits r by where each card sits, one move per destination', () => {
    const state = gameState({
      adventureL: [inst('in-lane')],
      scene: [inst('on-scene', 'scene')],
    });
    const { dispatch } = setup({ state, selection: new Set(['in-lane', 'on-scene']) });
    press('r');

    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['in-lane'],
      toZone: 'retire',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'MOVE_CARDS',
      uids: ['on-scene'],
      toZone: 'reveal',
    });
  });

  it('takes a selected token off the board with r while the rest go to Retire', () => {
    const state = gameState({ adventureL: [inst('char'), inst('candy', 'token')] });
    const { dispatch } = setup({ state, selection: new Set(['char', 'candy']) });
    press('r');

    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_CARD', uid: 'candy' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_CARDS', uids: ['char'], toZone: 'retire' });
  });

  it('leaves a token out of a bulk tap rather than refusing the whole group', () => {
    const state = gameState({ adventureL: [inst('char'), inst('candy', 'token')] });
    const { dispatch } = setup({ state, selection: new Set(['char', 'candy']) });
    press('t');

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TAPPED', uids: ['char'], tapped: true });
  });

  it('resets the whole selection to its printed inspiration with z', () => {
    const { dispatch } = setup({ state: sceneRow(), selection: three });
    press('z');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_INSPIRATION',
      uids: ['s1', 's2', 's3'],
      value: null,
    });
  });

  it('ignores the board keys, which a selection has no bearing on', () => {
    const { onDraw, onNextTurn } = setup({ state: sceneRow(), selection: three });
    press('d');
    press(' ', { code: 'Space' });

    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onNextTurn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveTargets', () => {
  const state = gameState({
    adventureL: [inst('lane')],
    scene: [inst('s1', 'scene'), inst('s2', 'scene')],
    hand: [inst('in-hand')],
  });

  it('returns the selection in board order, not the order it was built in', () => {
    const targets = resolveTargets(state, null, null, new Set(['s2', 'in-hand', 'lane', 's1']));

    // ALL_ZONES order: hand, then the lanes, then the Scene Zone.
    expect(targets.map((t) => t.instance.uid)).toEqual(['in-hand', 'lane', 's1', 's2']);
  });

  it('lets an open card menu override the selection, as the cursor does', () => {
    // The menu is a portal, so opening it moves the pointer off the card and
    // `hovered` goes null. Reading hover alone would aim the group's keys at a
    // card the player had just singled out.
    const targets = resolveTargets(state, null, 'in-hand', new Set(['s1', 's2']));

    expect(targets.map((t) => t.instance.uid)).toEqual(['in-hand']);
  });

  it('still acts on the selection when the open menu belongs to one of its cards', () => {
    const targets = resolveTargets(state, null, 's1', new Set(['s1', 's2']));

    expect(targets.map((t) => t.instance.uid)).toEqual(['s1', 's2']);
  });

  it('falls back to hover, then to the open menu, with nothing selected', () => {
    expect(resolveTargets(state, 's1', null, new Set()).map((t) => t.instance.uid)).toEqual(['s1']);
    expect(resolveTargets(state, null, 's2', new Set()).map((t) => t.instance.uid)).toEqual(['s2']);
    expect(resolveTargets(state, null, null, new Set())).toEqual([]);
  });

  it('reports the zone each target sits in, which r and h read', () => {
    expect(resolveTargets(state, null, null, new Set(['lane', 's1'])).map((t) => t.zone)).toEqual([
      'adventureL',
      'scene',
    ]);
  });

  it('ignores a selection whose cards have all left the board', () => {
    expect(resolveTargets(state, 's1', null, new Set(['gone'])).map((t) => t.instance.uid)).toEqual(
      ['s1']
    );
  });
});
