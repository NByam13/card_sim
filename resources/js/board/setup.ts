import { Card, Deck } from '@/types/cards';
import { copyKey, isShining, storyStageRank } from './mlp';
import {
  ALL_ZONES,
  CardInstance,
  GameState,
  OPENING_HAND_SIZE,
  STORY_ZONES,
  ZoneId,
} from './types';

/**
 * Dealing a deck onto the board, and the shuffle that does it.
 *
 * The deal runs in the browser, from the deck snapshot the lobby stored on the
 * game row. That is deliberate: the sync design is trusted clients each owning
 * their half of the table, and a server-side deal would be the first thing to
 * contradict it — besides needing rules the server does not have.
 *
 * @see documentation/local-board/spec.md
 */

/**
 * A unique id per physical card copy. Prefers crypto.randomUUID, but falls back
 * when it's unavailable — it only exists in secure contexts, so a dev server
 * opened over a plain-HTTP LAN IP would otherwise throw on board setup.
 */
function uid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

/** A fresh card instance for one physical copy, in its default (untapped, face-up) state. */
export function instance(card: Card): CardInstance {
  return {
    uid: uid(),
    card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

/** Expand a deck zone's entries (card + quantity) into one instance per copy. */
function expand(entries: { card: Card; quantity: number }[]): CardInstance[] {
  return entries.flatMap((e) => Array.from({ length: e.quantity }, () => instance(e.card)));
}

/**
 * A uniformly random integer in [0, max), drawn from the platform CSPRNG.
 *
 * Two reasons this is not `Math.floor(Math.random() * max)`. First the entropy:
 * V8 backs `Math.random` with xorshift128+, whose 128 bits of state can express
 * ~3.4e38 orderings, while a 50-card Main Deck has 50! ≈ 3.0e64 of them, leaving
 * all but a ~1e-26 sliver of shuffles unreachable. `getRandomValues` draws fresh
 * OS entropy per call and has no such ceiling. Second the bias: `% max` alone
 * would favour low values, because `max` divides 2^32 evenly only when it is a
 * power of two, leaving a short final bucket. Discarding that tail
 * (`value >= limit`) costs an occasional extra draw and makes the result exactly
 * uniform.
 *
 * `getRandomValues` is available in insecure contexts too, unlike the
 * `crypto.randomUUID` that `uid()` above has to guard against, so the fallback
 * here is for genuinely ancient engines only.
 */
function randomInt(max: number): number {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) return Math.floor(Math.random() * max);

  const limit = Math.floor(0x1_0000_0000 / max) * max; // largest multiple of max within 2^32
  const buf = new Uint32Array(1);
  let value: number;
  do {
    source.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

/** In-place-safe Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Piles a deck is dealt into. Ten is five cards each at Main Deck size. */
const PILE_COUNT = 10;

/**
 * Deal the deck into ten contiguous piles, top to bottom, then stack the piles
 * back up in a random order.
 *
 * Piles are split as evenly as the deck divides, so a 50-card Main Deck gives the
 * ten piles of five this models, and a shorter zone like the Scene Deck still
 * fills all ten rather than collapsing to a handful. Cards keep their order
 * within a pile, which is what makes this a coarse rearrangement of blocks
 * instead of a second Fisher-Yates.
 */
export function pileShuffle<T>(input: T[]): T[] {
  const piles: T[][] = [];
  for (let i = 0; i < PILE_COUNT; i++) {
    const start = Math.floor((input.length * i) / PILE_COUNT);
    const end = Math.floor((input.length * (i + 1)) / PILE_COUNT);
    if (end > start) piles.push(input.slice(start, end));
  }

  const out: T[] = [];
  while (piles.length > 0) {
    const [pile] = piles.splice(randomInt(piles.length), 1);
    out.push(...pile);
  }
  return out;
}

/**
 * The full deck shuffle: Fisher-Yates, a pile shuffle, then Fisher-Yates again.
 *
 * The pile pass sits between two uniform shuffles, so what comes out is the same
 * uniform distribution `shuffle` alone already produces. It is modelled on how
 * the deck is shuffled at the table, where piling is the step that stops a
 * freshly sorted deck coming out in near-sorted runs. The cost is one extra
 * pass over the deck.
 */
export function shuffleDeck<T>(input: T[]): T[] {
  return shuffle(pileShuffle(shuffle(input)));
}

/**
 * Shuffle the Scene Deck, then float the shining printings to the top **if every
 * card in it is the same base printing**.
 *
 * Everyday scenes are exempt from the 4-copy cap, so a legal 15-card Scene Deck
 * can be fifteen printings of one scene. In that deck the draw order carries no
 * information, since whatever comes off the top is the same card. The only thing
 * that varies between copies is the art, so leading with the shining ones is
 * free. Any other Scene Deck shuffles and stops there, because there the order
 * *is* the game.
 *
 * Grouping uses `copyKey`, the identity the 4-copy cap already uses: it collapses
 * the ※ marker and Day/Night art variants, so `BP02-ER01` and `※BP02-ER01D` are
 * one base printing. The sort is stable, so the shuffle still decides the order
 * within the shining and non-shining halves.
 */
export function arrangeSceneDeck(cards: CardInstance[]): CardInstance[] {
  const shuffled = shuffleDeck(cards);
  const printings = new Set(shuffled.map((c) => copyKey(c.card)));
  if (printings.size > 1) return shuffled;

  return shuffled.sort((a, b) => Number(isShining(b.card)) - Number(isShining(a.card)));
}

/** An empty zone map with every ZoneId present. */
export function emptyZones(): Record<ZoneId, CardInstance[]> {
  return Object.fromEntries(ALL_ZONES.map((z) => [z, [] as CardInstance[]])) as unknown as Record<
    ZoneId,
    CardInstance[]
  >;
}

/**
 * Build the opening game state from a deck: shuffle the Main Deck into the
 * library and the Scene Deck into its own pile, lay the Story cards left→right
 * into stages I–IV, seat the Main Character, and draw the opening hand. Plans
 * are NOT dealt here — that happens on Start Game, after the player sees their hand.
 *
 * Every piece is optional. The deck endpoint deliberately does not refuse an
 * incomplete deck ("a table decides what an incomplete deck means"), so a deck
 * with no Main Character, no Scenes or fewer than four Story cards deals into a
 * board with those zones empty rather than failing. The controls say what is
 * missing; the deal does not.
 */
export function initialState(deck: Deck): GameState {
  const zones = emptyZones();

  const byZone = (zone: string) => deck.cards.filter((e) => e.zone === zone);

  const library = shuffleDeck(expand(byZone('main')));
  zones.sceneDeck = arrangeSceneDeck(expand(byZone('scene')));

  // Story cards: one per stage, ordered I→IV by their printed stage.
  const storyEntries = [...byZone('story')].sort(
    (a, b) => storyStageRank(a.card.story_stage) - storyStageRank(b.card.story_stage)
  );
  storyEntries.forEach((entry, i) => {
    const slot = STORY_ZONES[i];
    if (slot) {
      for (let q = 0; q < entry.quantity; q++) zones[slot].push(instance(entry.card));
    }
  });

  if (deck.main_character) zones.mainChar = [instance(deck.main_character)];

  // Opening hand off the top of the shuffled library.
  zones.hand = library.splice(0, Math.min(OPENING_HAND_SIZE, library.length));
  zones.library = library;

  return { zones, turn: 1, started: false, goingFirst: null, mulliganed: false };
}
