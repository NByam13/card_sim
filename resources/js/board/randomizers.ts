/**
 * Physical randomizers for the board — a coin flip and d6 dice. These
 * are pure table-top helpers: they don't touch game state, they just produce a
 * result to show the player. Each takes an injectable RNG so the outcomes are
 * unit-testable; production calls fall back to Math.random.
 */

/** A random-number source in [0, 1), matching Math.random's contract. */
export type Rng = () => number;

export interface RollResult {
  /** The headline outcome, shown large — e.g. "Heads", "4", "8". */
  value: string;
  /** A fuller description for the toast/caption — e.g. "2d6: 3 + 5 = 8". */
  detail: string;
}

/** One six-sided die: an integer in 1–6. */
function d6(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

export function flipCoin(rng: Rng = Math.random): RollResult {
  const side = rng() < 0.5 ? 'Heads' : 'Tails';
  return { value: side, detail: `Coin flip: ${side}` };
}

export function rollD6(rng: Rng = Math.random): RollResult {
  const n = d6(rng);
  return { value: String(n), detail: `d6: ${n}` };
}

export function rollTwoD6(rng: Rng = Math.random): RollResult {
  const a = d6(rng);
  const b = d6(rng);
  return { value: String(a + b), detail: `2d6: ${a} + ${b} = ${a + b}` };
}
