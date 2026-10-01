const RAIL_BTN_BASE =
  'w-full rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 transition';

const RAIL_BTN = `${RAIL_BTN_BASE} bg-white text-gray-700 ring-gray-300 hover:bg-gray-50`;

/** A rail button that cannot be pressed right now: greyed, unhoverable, still readable. */
const RAIL_BTN_INERT = `${RAIL_BTN_BASE} cursor-not-allowed bg-gray-50 text-gray-400 ring-gray-200`;

const PRIMARY_BTN =
  'w-full rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700';

export interface BoardControlsProps {
  started: boolean;
  /** Whether this player is on the play; null until chosen. */
  goingFirst: boolean | null;
  /**
   * Offer the going-first toggle. Undefined once the turn-order slice settles
   * the seat, which must not then be overridden here.
   */
  onGoingFirstChange?: (value: boolean) => void;
  onStartGame: () => void;
  /** False while a match is still deciding turn order. Gates the Mulligan too. */
  canStart: boolean;
  /** Whether the one mulligan (rules 103.4.1c) has already been spent. */
  mulliganed: boolean;
  onMulligan: () => void;
  /** Null in a live match, where re-dealing your own board alone is not offered. */
  onRestart: (() => void) | null;
  onShuffleLibrary: () => void;
  onDraw: () => void;
  onNextTurn: () => void;
  /** What the next press does, or why it does nothing. */
  nextTurnLabel: string;
  /** False in a match when it is not your turn. */
  canAdvance: boolean;
}

/**
 * The right-rail action column. Start Game and Mulligan show only before the
 * game begins.
 *
 * Ported from PonyRec's `PlaytestControls.tsx`. In a match the last button
 * walks the shared turn cursor and is labelled with the stop it moves to.
 */
export default function BoardControls({
  started,
  goingFirst,
  onGoingFirstChange,
  onStartGame,
  canStart,
  mulliganed,
  onMulligan,
  onRestart,
  onShuffleLibrary,
  onDraw,
  onNextTurn,
  nextTurnLabel,
  canAdvance,
}: BoardControlsProps) {
  return (
    <div className="flex w-32 flex-col gap-1.5">
      {!started && (
        <div className="mb-1 space-y-1.5 rounded-lg bg-emerald-50/60 p-2">
          <p className="text-[10px] leading-tight text-gray-500">
            Review your opening hand. You may Mulligan once. Press Start Game to deal Plans.
          </p>
          {onGoingFirstChange && (
            // Stands in for the turn-order negotiation until that slice lands.
            // Going first means your opening Scene is dealt face down.
            <div className="flex overflow-hidden rounded-full ring-1 ring-gray-300">
              {[true, false].map((first) => (
                <button
                  key={String(first)}
                  onClick={() => onGoingFirstChange(first)}
                  className={`flex-1 px-2 py-1 text-[10px] font-semibold transition ${
                    goingFirst === first
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {first ? 'Going 1st' : 'Going 2nd'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onStartGame}
            disabled={!canStart}
            className={canStart ? PRIMARY_BTN : RAIL_BTN_INERT}
          >
            {canStart ? 'Start Game' : 'Deciding turn order'}
          </button>
          <button
            onClick={onMulligan}
            disabled={mulliganed || !canStart}
            className={mulliganed || !canStart ? RAIL_BTN_INERT : RAIL_BTN}
          >
            {mulliganed ? 'Mulligan used' : 'Mulligan'}
          </button>
        </div>
      )}
      {onRestart && (
        <button onClick={onRestart} className={RAIL_BTN}>
          Restart
        </button>
      )}
      <button onClick={onShuffleLibrary} className={RAIL_BTN}>
        Shuffle
      </button>
      <button onClick={onDraw} className={RAIL_BTN}>
        Draw
      </button>
      <button
        onClick={onNextTurn}
        disabled={!canAdvance}
        className={canAdvance ? PRIMARY_BTN : RAIL_BTN_INERT}
      >
        {nextTurnLabel}
      </button>
    </div>
  );
}
