import { Card } from '@/types/cards';
import { describe, expect, it, vi } from 'vitest';
import { arrangeSceneDeck, pileShuffle, shuffle, shuffleDeck } from './setup';
import { CardInstance } from './types';

/**
 * Ported from PonyRec's `decks/playtest/setup.test.ts`.
 *
 * One deliberate change: the printings that collapse onto a single base are
 * built with the `variant` object the deck endpoint returns, because the
 * endpoint does not send `printed_number` — the field PonyRec's own `copyKey`
 * uses for this. See `mlp.ts` and the spec; the behaviour under test is
 * unchanged.
 */
let uidCounter = 0;

/**
 * A scene printing. `art` marks it as a Day/Night variant, which is what
 * collapses it onto the base printing its number is a suffix of.
 */
function scene(cardNumber: string, rarity: string, art: string | null = null): CardInstance {
  const card: Card = {
    card_number: cardNumber,
    name: 'Golden Oak Library Floor 2',
    subtype: 'scene',
    rarity,
    set_code: 'BP02',
    harmony_cost: null,
    inspiration: null,
    story_stage: null,
    image_url: null,
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: art ? { kind: 'art', label: art } : null,
  };

  return {
    uid: `uid-${uidCounter++}`,
    card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

/**
 * A deck of one Everyday scene in its printings: two plain copies, plus the
 * shining Day and Night arts. All four collapse to the base printing `BP02-ER01`.
 */
function singlePrintingDeck(): CardInstance[] {
  return [
    scene('BP02-ER01', 'ER'),
    scene('※BP02-ER01D', '※ER', 'day'),
    scene('※BP02-ER01N', '※ER', 'night'),
    scene('BP02-ER01', 'ER'),
  ];
}

const isShining = (c: CardInstance) => c.card.rarity.startsWith('※');

describe('arrangeSceneDeck', () => {
  it('floats the shining printings to the top when every card is one base printing', () => {
    const arranged = arrangeSceneDeck(singlePrintingDeck());

    expect(arranged.slice(0, 2).every(isShining)).toBe(true);
    expect(arranged.slice(2).some(isShining)).toBe(false);
  });

  it('keeps every card, exactly once', () => {
    const deck = singlePrintingDeck();
    const arranged = arrangeSceneDeck(deck);

    expect(arranged).toHaveLength(deck.length);
    expect(new Set(arranged.map((c) => c.uid))).toEqual(new Set(deck.map((c) => c.uid)));
  });

  it('leaves a mixed deck shuffled, with no shining bias', () => {
    // Two different scenes, so draw order is real information and must stay random.
    // Run it enough times that a sort would show up as a fixed first card.
    const deck = [
      scene('BP02-ER01', 'ER'),
      scene('※BP02-ER02D', '※ER', 'day'),
      scene('BP02-ER03', 'ER'),
      scene('※BP02-ER04N', '※ER', 'night'),
    ];

    const firstCards = new Set(
      Array.from({ length: 60 }, () => arrangeSceneDeck(deck)[0].card.card_number)
    );

    expect(firstCards.size).toBeGreaterThan(1);
  });

  it('handles a deck with no shining printings, and an empty one', () => {
    const plain = [scene('BP02-ER01', 'ER'), scene('BP02-ER01', 'ER')];

    expect(arrangeSceneDeck(plain)).toHaveLength(2);
    expect(arrangeSceneDeck([])).toEqual([]);
  });

  it('does not mutate the deck it was handed', () => {
    const deck = singlePrintingDeck();
    const before = deck.map((c) => c.uid);

    arrangeSceneDeck(deck);

    expect(deck.map((c) => c.uid)).toEqual(before);
  });
});

describe('shuffle', () => {
  const deck = Array.from({ length: 50 }, (_, i) => i);

  it('is a permutation, keeping every card exactly once', () => {
    const shuffled = shuffle(deck);

    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(deck);
  });

  it('does not mutate the array it was handed', () => {
    const input = [...deck];
    shuffle(input);
    expect(input).toEqual(deck);
  });

  it('handles empty and single-card decks', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([7])).toEqual([7]);
  });

  it('actually reorders a 50-card deck', () => {
    // A 1-in-50! chance of a false failure, which is not a risk worth naming.
    expect(shuffle(deck)).not.toEqual(deck);
  });

  /**
   * Fisher-Yates is uniform only if the swap partner is drawn from an inclusive
   * range; the Sattolo variant (`j` excluding `i`) produces a single cycle, so no
   * card can ever stay put.
   *
   * Driving the generator makes that difference exact rather than statistical. The
   * loop calls `randomInt(i + 1)` for i = 49…1, so feeding it `max - 1` every time
   * forces `j === i` on every pass: an inclusive draw self-swaps its way to the
   * identity permutation, which an exclusive one cannot reach at all. Sampling the
   * first slot instead used to fail roughly 1 run in 3000, since a uniform shuffle
   * leaves card 0 alone with probability (49/50)^400.
   */
  it('can leave a card in the position it started in', () => {
    let next = deck.length - 1;
    const draws = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((buf) => {
      (buf as unknown as Uint32Array)[0] = next--;
      return buf;
    });

    try {
      expect(shuffle(deck)).toEqual(deck);
      expect(draws).toHaveBeenCalledTimes(deck.length - 1);
    } finally {
      draws.mockRestore();
    }
  });

  it('reaches every position from a given starting slot', () => {
    const landings = new Set(Array.from({ length: 500 }, () => shuffle(deck).indexOf(0)));
    // 500 draws over 50 slots: seeing at least 40 distinct ones is a wide margin
    // over chance, but fails loudly if the draw collapses onto a subset.
    expect(landings.size).toBeGreaterThan(40);
  });

  it('falls back to Math.random when the platform has no CSPRNG', () => {
    const original = globalThis.crypto;
    // Some engines expose `crypto` as a non-writable own property.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const shuffled = shuffle(deck);
      expect([...shuffled].sort((a, b) => a - b)).toEqual(deck);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('pileShuffle', () => {
  const deck = Array.from({ length: 50 }, (_, i) => i);
  /** The ten contiguous piles a 50-card deck is dealt into, top to bottom. */
  const piles = Array.from({ length: 10 }, (_, i) => deck.slice(i * 5, i * 5 + 5));

  it('is a permutation, keeping every card exactly once', () => {
    const piled = pileShuffle(deck);

    expect(piled).toHaveLength(deck.length);
    expect([...piled].sort((a, b) => a - b)).toEqual(deck);
  });

  it('does not mutate the array it was handed', () => {
    const input = [...deck];
    pileShuffle(input);
    expect(input).toEqual(deck);
  });

  it('keeps each pile intact and in order, only restacking the piles', () => {
    // Every five-card slot of the result has to be one of the original piles,
    // unbroken. That is the property that separates this from a second shuffle.
    const piled = pileShuffle(deck);
    const slots = Array.from({ length: 10 }, (_, i) => piled.slice(i * 5, i * 5 + 5));

    for (const slot of slots) {
      expect(piles).toContainEqual(slot);
    }
    expect(new Set(slots.map((s) => s[0])).size).toBe(10);
  });

  it('restacks the piles in varying orders', () => {
    // Which pile lands on top is the only thing this pass decides.
    const tops = new Set(Array.from({ length: 200 }, () => pileShuffle(deck)[0]));

    expect(tops.size).toBeGreaterThan(5);
    for (const top of tops) {
      expect(top % 5).toBe(0);
    }
  });

  it('splits a deck shorter than the pile count without dropping cards', () => {
    // A 15-card Scene Deck, and the degenerate sizes below one card per pile.
    const sceneDeck = Array.from({ length: 15 }, (_, i) => i);

    expect([...pileShuffle(sceneDeck)].sort((a, b) => a - b)).toEqual(sceneDeck);
    expect(pileShuffle([1, 2, 3])).toHaveLength(3);
    expect(pileShuffle([7])).toEqual([7]);
    expect(pileShuffle([])).toEqual([]);
  });
});

describe('shuffleDeck', () => {
  const deck = Array.from({ length: 50 }, (_, i) => i);

  it('is a permutation, keeping every card exactly once', () => {
    const shuffled = shuffleDeck(deck);

    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(deck);
  });

  it('does not mutate the array it was handed', () => {
    const input = [...deck];
    shuffleDeck(input);
    expect(input).toEqual(deck);
  });

  it('handles empty and single-card decks', () => {
    expect(shuffleDeck([])).toEqual([]);
    expect(shuffleDeck([7])).toEqual([7]);
  });

  it('leaves no pile boundary standing, unlike the pile pass alone', () => {
    // The trailing Fisher-Yates is what stops the result reading as ten blocks
    // of five, so a five-card slot matching an original pile should be rare.
    const piles = Array.from({ length: 10 }, (_, i) => deck.slice(i * 5, i * 5 + 5));
    const intact = Array.from({ length: 50 }, () => shuffleDeck(deck)).filter((shuffled) =>
      Array.from({ length: 10 }, (_, i) => shuffled.slice(i * 5, i * 5 + 5)).some((slot) =>
        piles.some((pile) => pile.every((card, k) => card === slot[k]))
      )
    );

    expect(intact).toHaveLength(0);
  });

  it('breaks up the runs of identical copies a deck is built from', () => {
    // expand() lays 4-ofs down adjacent, so an unshuffled Main Deck has 37
    // same-neighbour pairs. Shuffled, the expected count is sum n(n-1)/N = 2.92.
    // Averaging over 200 deals keeps this far from a flaky per-deal threshold.
    const fourOfs = Array.from({ length: 50 }, (_, i) => Math.floor(i / 4));
    const adjacentPairs = (arr: number[]) =>
      arr.reduce((n, card, i) => (i > 0 && card === arr[i - 1] ? n + 1 : n), 0);

    const deals = Array.from({ length: 200 }, () => adjacentPairs(shuffleDeck(fourOfs)));
    const mean = deals.reduce((a, b) => a + b, 0) / deals.length;

    expect(adjacentPairs(fourOfs)).toBe(37);
    expect(mean).toBeGreaterThan(1);
    expect(mean).toBeLessThan(6);
  });
});
