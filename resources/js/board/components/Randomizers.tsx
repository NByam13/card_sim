import { flipCoin, RollResult, rollD6, rollTwoD6 } from '../randomizers';
import { useState } from 'react';

const RAIL_BTN =
  'w-full rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50';

/**
 * Coin-flip and dice tray for the right rail. Rolls are cosmetic (never touch game
 * state); the latest result stays pinned in the panel and is also echoed via
 * `onResult` for a transient toast.
 */
export default function Randomizers({ onResult }: { onResult?: (detail: string) => void }) {
  const [last, setLast] = useState<RollResult | null>(null);
  // Bumped per roll so the result's pop animation replays even on a repeat value.
  const [rollCount, setRollCount] = useState(0);

  const roll = (fn: () => RollResult) => () => {
    const result = fn();
    setLast(result);
    setRollCount((n) => n + 1);
    onResult?.(result.detail);
  };

  return (
    <div className="flex w-32 flex-col gap-1.5 rounded-lg bg-gray-50 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Randomizers</p>
      <button onClick={roll(flipCoin)} className={RAIL_BTN}>
        Flip coin
      </button>
      <button onClick={roll(rollD6)} className={RAIL_BTN}>
        Roll d6
      </button>
      <button onClick={roll(rollTwoD6)} className={RAIL_BTN}>
        Roll 2d6
      </button>
      {last && (
        <div
          // Re-key on each roll so the pop animation replays even on a repeat value.
          key={rollCount}
          className="mt-0.5 animate-[pulse_0.4s_ease-out] rounded-md bg-white p-2 text-center shadow-sm ring-1 ring-gray-200"
        >
          <div className="text-xl font-extrabold leading-none text-gray-900">{last.value}</div>
          <div className="mt-1 text-[10px] leading-tight text-gray-500">{last.detail}</div>
        </div>
      )}
    </div>
  );
}
