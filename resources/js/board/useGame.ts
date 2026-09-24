import { Card, Deck } from '@/types/cards';
import { useReducer } from 'react';
import { arrangeSceneDeck, emptyZones, initialState, instance, shuffleDeck } from './setup';
import { ALL_ZONES, CardInstance, GameState, PLAN_ZONES, STORY_ZONES, ZoneId } from './types';

/**
 * The board's whole game model: every change a player can make to their half of
 * the table, as one reducer.
 *
 * The table enforces no rules — no costs are paid, no Exchange is resolved,
 * nothing is illegal. What lives here is the physical business of moving cards
 * around, plus the few MLP setup steps (the Plan deal, the opening Scene, the
 * mulligan) that are tedious enough by hand to be worth automating.
 *
 * Still MLP-typed on purpose; see the spec.
 *
 * @see documentation/local-board/spec.md
 */
type Action =
  | { type: 'MOVE_CARD'; uid: string; toZone: ZoneId; toIndex?: number }
  /** The group move behind a multi-select drag. See `moveCards`. */
  | { type: 'MOVE_CARDS'; uids: string[]; toZone: ZoneId; toIndex?: number }
  | { type: 'DRAW'; n: number }
  | { type: 'SHUFFLE_LIBRARY' }
  | { type: 'SHUFFLE_SCENE_DECK' }
  | { type: 'START_GAME' }
  | { type: 'SET_GOING_FIRST'; goingFirst: boolean | null }
  | { type: 'MULLIGAN' }
  /**
   * Untap, reveal a Scene, draw 1. `draw` is only ever false on a shared turn 1,
   * where the player on the play skips their draw; solo never passes it.
   */
  | { type: 'NEXT_TURN'; draw?: boolean }
  | { type: 'REVEAL_SCENE' }
  | { type: 'RESTART' }
  | { type: 'TAP'; uid: string }
  | { type: 'FLIP'; uid: string }
  /**
   * Tap/turn a whole group to one explicit state, rather than toggling each
   * card. The multi-select keyboard levels a mixed selection instead of
   * flipping each card's own value, which would leave it just as mixed, so it
   * needs to say what the answer is rather than ask for a toggle. `TAP`/`FLIP`
   * stay the toggles, for double-click and the card menu.
   */
  | { type: 'SET_TAPPED'; uids: string[]; tapped: boolean }
  | { type: 'SET_FACE_DOWN'; uids: string[]; faceDown: boolean }
  | { type: 'SET_INSPIRATION'; uids: string[]; value: number | null }
  | { type: 'BUMP_INSPIRATION'; uid: string; delta: number }
  | { type: 'ADD_COUNTER'; uid: string }
  | { type: 'REMOVE_COUNTER'; uid: string }
  | { type: 'RESET_COUNTERS'; uid: string }
  | { type: 'TUTOR'; uid: string; toZone: ZoneId; toTop?: boolean }
  | { type: 'TO_PLAN'; uid: string }
  | { type: 'PROMOTE_STAGE' }
  | { type: 'SPAWN_TOKEN'; card: Card; toZone: ZoneId }
  | { type: 'REMOVE_CARD'; uid: string };

/** Locate a card instance and the zone it currently sits in. */
function locate(state: GameState, uid: string): { zone: ZoneId; index: number } | null {
  for (const zone of Object.keys(state.zones) as ZoneId[]) {
    const index = state.zones[zone].findIndex((c) => c.uid === uid);
    if (index !== -1) return { zone, index };
  }
  return null;
}

/** Return a new zones map with every card in `uids` updated by `fn`, wherever they live. */
function mapCards(
  zones: Record<ZoneId, CardInstance[]>,
  uids: readonly string[],
  fn: (c: CardInstance) => CardInstance
): Record<ZoneId, CardInstance[]> {
  const wanted = new Set(uids);
  const next = { ...zones };
  for (const zone of Object.keys(next) as ZoneId[]) {
    if (next[zone].some((c) => wanted.has(c.uid))) {
      next[zone] = next[zone].map((c) => (wanted.has(c.uid) ? fn(c) : c));
    }
  }
  return next;
}

/** `mapCards` for the single-card actions, which are most of them. */
function mapCard(
  zones: Record<ZoneId, CardInstance[]>,
  uid: string,
  fn: (c: CardInstance) => CardInstance
): Record<ZoneId, CardInstance[]> {
  return mapCards(zones, [uid], fn);
}

/**
 * Zones a card cannot be face-down in, so entering one turns it face up: your own
 * Hand (you always see your cards) and the Reveal Zone (whose entire purpose is
 * showing a card to your opponent — a face-down "reveal" would be a contradiction).
 */
const REVEALS_ON_ENTRY: ZoneId[] = ['hand', 'reveal'];

/**
 * The Plan slot a card added mid-game should land in, or null when all four are
 * full. Setup deals Plans I→IV and an opponent's hits strip them I→IV, but a Plan
 * put *back* goes into the highest-numbered free slot — so refilling runs
 * IV→III→II→I. Because the target is deterministic, neither entry route
 * (BP02-C13's top-of-deck, BP02-SR07's from-hand) needs to ask which slot.
 */
export function nextPlanSlot(zones: Record<ZoneId, CardInstance[]>): ZoneId | null {
  return [...PLAN_ZONES].reverse().find((zone) => zones[zone].length === 0) ?? null;
}

/**
 * The Main Character's route up the board: it waits on its own rail, then advances
 * onto Story Stage I and along to IV, where reaching the end wins the game.
 */
const PROMOTION_CHAIN: ZoneId[] = ['mainChar', ...STORY_ZONES];

/**
 * Where the Main Character stands and where promoting would put it. Null when
 * there's no Main Character on the chain at all, and `to: null` when it has
 * already reached Story Stage IV.
 *
 * Structural (any card whose subtype is `main-character`) rather than tied to the
 * deck's declared Main Character, so a board that got one there by some other
 * route still promotes it. Exported so the board can tell "nothing to promote"
 * from "already at the top" and toast accordingly.
 */
export function promotionTarget(
  zones: Record<ZoneId, CardInstance[]>
): { uid: string; from: ZoneId; to: ZoneId | null } | null {
  for (const [index, zone] of PROMOTION_CHAIN.entries()) {
    const found = zones[zone].find((c) => c.card.subtype === 'main-character');
    if (found) {
      return { uid: found.uid, from: zone, to: PROMOTION_CHAIN[index + 1] ?? null };
    }
  }
  return null;
}

/**
 * Lift every card in `uids` out of wherever it sits and set the lot down in
 * `toZone`, contiguously, at `toIndex` (or the end).
 *
 * Every card comes out *before* any goes in, which is the whole reason this is
 * one action rather than a move dispatched per card: each removal would shift
 * the indices under the next, so a group dropped between two Hand cards would
 * arrive scattered. `toIndex` is therefore read against the destination as it
 * stands once the moved cards have left it. That is the same contract the Hand's
 * drop measurement already keeps, since it skips the cards being dragged.
 *
 * The group keeps its board order (zone order first, then position within a
 * zone), so a row of Scenes dropped into the Hand reads the way it read on the
 * board rather than in whatever order the selection happened to be built.
 */
function moveCards(
  state: GameState,
  uids: readonly string[],
  toZone: ZoneId,
  toIndex?: number
): GameState {
  const wanted = new Set(uids);
  const zones = { ...state.zones };
  const moving: CardInstance[] = [];

  for (const zone of ALL_ZONES) {
    if (!zones[zone].some((c) => wanted.has(c.uid))) continue;
    const kept: CardInstance[] = [];
    for (const card of zones[zone]) {
      (wanted.has(card.uid) ? moving : kept).push(card);
    }
    zones[zone] = kept;
  }
  if (moving.length === 0) return state;

  const arriving = moving.map((c) =>
    REVEALS_ON_ENTRY.includes(toZone) && c.faceDown ? { ...c, faceDown: false } : c
  );
  const dest = [...zones[toZone]];
  dest.splice(toIndex ?? dest.length, 0, ...arriving);
  zones[toZone] = dest;

  return { ...state, zones };
}

/** `moveCards` for the single-card actions, which are most of them. */
function moveCard(state: GameState, uid: string, toZone: ZoneId, toIndex?: number): GameState {
  return moveCards(state, [uid], toZone, toIndex);
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'MOVE_CARD':
      return moveCard(state, action.uid, action.toZone, action.toIndex);

    case 'MOVE_CARDS':
      return moveCards(state, action.uids, action.toZone, action.toIndex);

    case 'DRAW': {
      if (state.zones.library.length === 0) return state;
      const library = [...state.zones.library];
      const drawn = library.splice(0, Math.min(action.n, library.length));
      return {
        ...state,
        zones: {
          ...state.zones,
          library,
          hand: [...state.zones.hand, ...drawn],
        },
      };
    }

    case 'SHUFFLE_LIBRARY':
      return {
        ...state,
        zones: {
          ...state.zones,
          library: shuffleDeck(state.zones.library),
        },
      };

    case 'SHUFFLE_SCENE_DECK':
      // Same arrangement the opening deal uses, so a mid-game shuffle can't undo
      // the shining-on-top ordering of a single-printing Scene Deck.
      return {
        ...state,
        zones: {
          ...state.zones,
          sceneDeck: arrangeSceneDeck(state.zones.sceneDeck),
        },
      };

    case 'START_GAME': {
      if (state.started) return state;
      const library = [...state.zones.library];
      const zones = { ...state.zones };
      // Top of the library deals face-down onto each Story stage as a Plan.
      PLAN_ZONES.forEach((planZone) => {
        const top = library.shift();
        if (top) zones[planZone] = [{ ...top, faceDown: true }];
      });
      zones.library = library;
      // Setup also reveals the first Scene (you begin with 1 Scene; the first
      // Next Turn adds a second). The player on the play sets theirs down
      // FACE DOWN — the single mechanical difference between going first
      // and going second in this tool.
      if (zones.sceneDeck.length > 0) {
        const sceneDeck = [...zones.sceneDeck];
        const first = sceneDeck.shift()!;
        zones.sceneDeck = sceneDeck;
        zones.scene = [...zones.scene, { ...first, faceDown: state.goingFirst === true }];
      }
      return { ...state, zones, started: true };
    }

    case 'SET_GOING_FIRST':
      // Locked in once the board is dealt; flipping it later would imply a
      // re-deal the player did not ask for.
      return state.started ? state : { ...state, goingFirst: action.goingFirst };

    case 'MULLIGAN': {
      // Rules 103.4.1a: the hand goes to the *bottom* of the Main Deck in its
      // current order and the replacement comes off the top. Deliberately NO
      // shuffle, which is the whole point of the rule: it means the cards you just
      // put back are the last ones you could see again. 103.4.1c caps it at one
      // per game, and Start Game closes the window regardless.
      if (state.started || state.mulliganed) return state;
      const library = [...state.zones.library, ...state.zones.hand];
      const hand = library.splice(0, Math.min(state.zones.hand.length, library.length));
      return { ...state, mulliganed: true, zones: { ...state.zones, library, hand } };
    }

    case 'NEXT_TURN': {
      const zones = { ...state.zones };
      // Untap everything.
      for (const zone of Object.keys(zones) as ZoneId[]) {
        if (zones[zone].some((c) => c.tapped)) {
          zones[zone] = zones[zone].map((c) => (c.tapped ? { ...c, tapped: false } : c));
        }
      }
      // Reveal the top Scene Deck card into the Scene Zone.
      if (zones.sceneDeck.length > 0) {
        const sceneDeck = [...zones.sceneDeck];
        const revealed = sceneDeck.shift()!;
        zones.sceneDeck = sceneDeck;
        zones.scene = [...zones.scene, revealed];
      }
      // Draw 1.
      if (action.draw !== false && zones.library.length > 0) {
        const library = [...zones.library];
        const drawn = library.shift()!;
        zones.library = library;
        zones.hand = [...zones.hand, drawn];
      }
      return { ...state, zones, turn: state.turn + 1 };
    }

    case 'REVEAL_SCENE': {
      if (state.zones.sceneDeck.length === 0) return state;
      const sceneDeck = [...state.zones.sceneDeck];
      const revealed = sceneDeck.shift()!;
      return {
        ...state,
        zones: { ...state.zones, sceneDeck, scene: [...state.zones.scene, revealed] },
      };
    }

    case 'TAP':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          tapped: !c.tapped,
        })),
      };

    case 'FLIP':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          faceDown: !c.faceDown,
        })),
      };

    case 'SET_TAPPED':
      return {
        ...state,
        zones: mapCards(state.zones, action.uids, (c) =>
          c.tapped === action.tapped ? c : { ...c, tapped: action.tapped }
        ),
      };

    case 'SET_FACE_DOWN':
      return {
        ...state,
        zones: mapCards(state.zones, action.uids, (c) =>
          c.faceDown === action.faceDown ? c : { ...c, faceDown: action.faceDown }
        ),
      };

    case 'SET_INSPIRATION':
      return {
        ...state,
        zones: mapCards(state.zones, action.uids, (c) => ({
          ...c,
          inspiration: action.value,
        })),
      };

    case 'BUMP_INSPIRATION':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          inspiration: (c.inspiration ?? c.card.inspiration ?? 0) + action.delta,
        })),
      };

    case 'ADD_COUNTER':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          counters: c.counters + 1,
        })),
      };

    case 'REMOVE_COUNTER':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          counters: Math.max(0, c.counters - 1),
        })),
      };

    case 'RESET_COUNTERS':
      return {
        ...state,
        zones: mapCard(state.zones, action.uid, (c) => ({
          ...c,
          counters: 0,
        })),
      };

    case 'TUTOR': {
      const at = locate(state, action.uid);
      if (!at) return state;
      const source = at.zone;
      const index = action.toTop && action.toZone === 'library' ? 0 : undefined;
      const moved = moveCard(state, action.uid, action.toZone, index);
      // Browsing a hidden pile to pull a card exposes its order, so reshuffle the
      // remainder of the *source* pile (Library or Scene Deck). Placing a card back
      // onto its own pile (e.g. Library → top) is a deliberate position, not a peek,
      // so it never triggers a reshuffle. Public zones (Retire) never reshuffle.
      const exposesOrder =
        (source === 'library' || source === 'sceneDeck') && source !== action.toZone;
      return exposesOrder
        ? { ...moved, zones: { ...moved.zones, [source]: shuffleDeck(moved.zones[source]) } }
        : moved;
    }

    case 'TO_PLAN': {
      const slot = nextPlanSlot(state.zones);
      // All four slots full — the effect simply has nowhere to go.
      if (!slot) return state;
      const moved = moveCard(state, action.uid, slot);
      // A Plan always arrives face down, whether it came off the top of the
      // deck (BP02-C13) or out of hand (BP02-SR07) — in the latter case that
      // is the point, since the Rival must not see what you tucked away.
      return {
        ...moved,
        zones: mapCard(moved.zones, action.uid, (c) => ({ ...c, faceDown: true, tapped: false })),
      };
    }

    case 'PROMOTE_STAGE': {
      const target = promotionTarget(state.zones);
      // No Main Character, or it is already on Stage IV. The board says so with a
      // toast rather than silently doing nothing.
      if (!target?.to) return state;
      // A plain move: tapped/counter state rides along, because the board enforces
      // no rules and clearing it would be a decision the player did not make.
      return moveCard(state, target.uid, target.to);
    }

    case 'SPAWN_TOKEN': {
      // A token is a card in the lane, tucked behind whatever is already there
      // (the same overlap an adorned Item gets), not a child of the card it was
      // spawned onto.
      const zone = [...state.zones[action.toZone], instance(action.card)];
      return { ...state, zones: { ...state.zones, [action.toZone]: zone } };
    }

    case 'REMOVE_CARD': {
      // Off the board entirely, not into Retire: the only cards removed this way
      // are tokens, which were never in the decklist and would otherwise turn up
      // in the discard pile and its viewer.
      const at = locate(state, action.uid);
      if (!at) return state;
      const zone = state.zones[at.zone].filter((c) => c.uid !== action.uid);
      return { ...state, zones: { ...state.zones, [at.zone]: zone } };
    }

    default:
      return state;
  }
}

/**
 * Drive the whole board. `deck` is only read on mount / RESTART. `saved`
 * replaces the fresh opening state, and is what the persistence slice will hand
 * a reconnecting player; RESTART still deals a brand-new board from the deck.
 */
export function useGame(deck: Deck, saved?: GameState | null) {
  const [state, dispatch] = useReducer(
    // RESTART deals a brand-new board, but who's on the play is set once — carry
    // it across so a restart doesn't silently deal the first player's Scene face
    // up.
    (s: GameState, a: Action): GameState =>
      a.type === 'RESTART' ? { ...initialState(deck), goingFirst: s.goingFirst } : reducer(s, a),
    deck,
    (d: Deck) => saved ?? initialState(d)
  );

  return { state, dispatch } as const;
}

export type { Action };
// `reducer` is exported for unit tests; the app drives it through `useGame`.
export { emptyZones, PLAN_ZONES, reducer, STORY_ZONES };
