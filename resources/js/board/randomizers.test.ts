import { describe, expect, it } from 'vitest';
import { flipCoin, Rng, rollD6, rollTwoD6 } from './randomizers';

/** A deterministic RNG that yields the given values in order, then repeats the last. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('flipCoin', () => {
  it('reads the low half as Heads', () => {
    expect(flipCoin(seq(0)).value).toBe('Heads');
    expect(flipCoin(seq(0.49)).value).toBe('Heads');
  });

  it('reads the high half as Tails', () => {
    expect(flipCoin(seq(0.5)).value).toBe('Tails');
    expect(flipCoin(seq(0.99)).value).toBe('Tails');
  });
});

describe('rollD6', () => {
  it('maps the RNG range onto 1–6', () => {
    expect(rollD6(seq(0)).value).toBe('1');
    expect(rollD6(seq(0.99)).value).toBe('6');
    expect(rollD6(seq(0.5)).value).toBe('4');
  });

  it('never falls outside 1–6 across the unit interval', () => {
    for (let r = 0; r < 1; r += 0.01) {
      const n = Number(rollD6(seq(r)).value);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});

describe('rollTwoD6', () => {
  it('sums the two dice and shows the breakdown', () => {
    const result = rollTwoD6(seq(0, 0.99)); // 1 then 6
    expect(result.value).toBe('7');
    expect(result.detail).toBe('2d6: 1 + 6 = 7');
  });

  it('rolls each die independently', () => {
    const result = rollTwoD6(seq(0.5, 0.5)); // 4 and 4
    expect(result.value).toBe('8');
  });
});
