import Modal from '@/components/Modal';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { opposingSeat, Seat } from '@/types/game';
import { TurnOrder, TurnOrderRoll } from '../sync/types';

/** How long the dice tumble before a roll that arrives live lands. */
export const ROLL_REVEAL_MS = 1100;

/** How long the decision holds on screen before the modal steps aside. */
export const DECIDED_HOLD_MS = 1600;

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const rollKey = (roll: TurnOrderRoll | null) =>
  roll ? `${roll.host.join()}|${roll.guest.join()}|${roll.rerolls}` : null;

/**
 * Deciding who goes first, in front of the whole board, before either seat has
 * drawn. Two stages: settling who chooses (the 2d6 roll), then the choice.
 *
 * It cannot be dismissed. Once the first player is decided it holds the result
 * for a moment and then calls `onDone`.
 */
export default function TurnOrderModal({
  seat,
  names,
  turnOrder,
  opponentPresent,
  onRoll,
  onElect,
  onDone,
}: {
  seat: Seat;
  names: Record<Seat, string>;
  turnOrder: TurnOrder;
  opponentPresent: boolean;
  onRoll: () => void;
  onElect: (firstPlayer: Seat) => void;
  onDone: () => void;
}) {
  const { roll, first_player } = turnOrder;
  const opponent = opposingSeat(seat);
  const revealing = useRollReveal(roll);
  const settled = roll !== null && !revealing;
  const chooser = settled ? roll.winner : null;
  const [pending, setPending] = useState(false);

  // A response, a broadcast or a reload after a failure all land as a new turn order.
  useEffect(() => setPending(false), [turnOrder]);

  useEffect(() => {
    if (!first_player) return;

    const timer = setTimeout(onDone, DECIDED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [first_player, onDone]);

  return (
    <Modal
      show
      closeable={false}
      onClose={() => {}}
      maxWidth="lg"
      labelledBy="turn-order-title"
      backdrop="backdrop:bg-slate-900/70 backdrop:backdrop-blur-md"
    >
      <div className="bg-linear-to-br from-emerald-500 to-teal-700 px-6 pt-6 pb-12 text-center text-white">
        <p className="text-[10px] font-semibold tracking-widest text-emerald-100 uppercase">
          Before you draw
        </p>
        <h2 id="turn-order-title" className="mt-1 text-2xl font-semibold">
          Who goes first?
        </h2>
        <p className="mt-1 text-sm text-emerald-50">
          Roll 2d6 each. The higher total chooses who goes first.
        </p>
      </div>

      <div className="-mt-8 space-y-5 px-6 pb-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <SeatDice
            name="You"
            dice={roll?.[seat] ?? null}
            rolling={revealing}
            won={chooser === seat}
            lost={chooser === opponent}
          />
          <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">vs</span>
          <SeatDice
            name={names[opponent]}
            dice={roll?.[opponent] ?? null}
            rolling={revealing}
            won={chooser === opponent}
            lost={chooser === seat}
            away={!opponentPresent}
          />
        </div>

        {settled && roll.rerolls > 0 && (
          <p className="motion-safe:animate-rise-in text-center text-xs text-gray-400">
            Tied {roll.rerolls} {roll.rerolls === 1 ? 'time' : 'times'} before that, and rerolled
          </p>
        )}

        <div
          aria-live="polite"
          className="flex min-h-28 flex-col items-center justify-center gap-3"
        >
          {first_player ? (
            <Decided
              headline={
                first_player === seat ? 'You go first' : `${names[first_player]} goes first`
              }
            />
          ) : !roll ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  onRoll();
                }}
                className="rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:translate-y-0 disabled:opacity-60"
              >
                {pending ? 'Rolling…' : 'Roll the dice'}
              </button>
              <p className="text-xs text-gray-500">Either of you can roll. One roll covers both.</p>
            </>
          ) : revealing ? (
            <p className="text-sm font-medium text-gray-500">Rolling…</p>
          ) : chooser === seat ? (
            <div className="motion-safe:animate-rise-in w-full space-y-3">
              <p className="text-center text-sm font-semibold text-gray-900">
                You won the roll. Your call:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Choice
                  title="Go first"
                  detail="Skip your first draw. Your opening Scene goes face down."
                  disabled={pending}
                  primary
                  onClick={() => {
                    setPending(true);
                    onElect(seat);
                  }}
                />
                <Choice
                  title="Go second"
                  detail="Draw on your first turn."
                  disabled={pending}
                  onClick={() => {
                    setPending(true);
                    onElect(opponent);
                  }}
                />
              </div>
            </div>
          ) : (
            <Waiting>{names[opponent]} won the roll and is choosing who goes first</Waiting>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * True while a roll that arrived after mount is still tumbling. A roll already
 * there on mount (a reload mid-election) is shown settled.
 */
function useRollReveal(roll: TurnOrderRoll | null): boolean {
  const key = rollKey(roll);
  const seen = useRef(key);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (key === null || key === seen.current) return;

    seen.current = key;
    setRevealing(true);
    const timer = setTimeout(() => setRevealing(false), ROLL_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return revealing;
}

function SeatDice({
  name,
  dice,
  rolling,
  won,
  lost,
  away = false,
}: {
  name: string;
  dice: number[] | null;
  rolling: boolean;
  won: boolean;
  lost: boolean;
  away?: boolean;
}) {
  const total = dice?.reduce((sum, die) => sum + die, 0);
  const shown = dice && !rolling;

  return (
    <div
      aria-label={shown ? `${name} rolled ${total}` : name}
      className={`relative flex flex-col items-center gap-3 rounded-2xl bg-white px-4 pt-5 pb-4 shadow-lg ring-1 transition duration-300 ${
        won
          ? 'scale-105 ring-2 ring-emerald-400 shadow-emerald-500/20'
          : lost
            ? 'opacity-60 ring-gray-200'
            : 'ring-gray-200'
      }`}
    >
      {won && (
        <span className="motion-safe:animate-pop-in absolute -top-3 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-950 uppercase shadow">
          Won the roll
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
        {away && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">
            Away
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {[0, 1].map((i) => (
          // Keyed by face, so a landing remounts the die and its animation plays.
          <Die
            key={`${i}:${shown ? dice[i] : rolling ? 'rolling' : 'blank'}`}
            value={shown ? dice[i] : null}
            rolling={rolling}
          />
        ))}
      </div>
      <span
        className={`text-2xl font-bold tabular-nums ${shown ? 'text-gray-900' : 'text-gray-300'}`}
      >
        {shown ? total : '–'}
      </span>
    </div>
  );
}

/** One die. Null is a face not yet known: blank at rest, cycling while it tumbles. */
function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * 6));

  useEffect(() => {
    if (!rolling) return;

    const timer = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(timer);
  }, [rolling]);

  const pips = rolling ? PIPS[face] : value ? PIPS[value] : [];
  const motion = rolling
    ? 'motion-safe:animate-die-tumble'
    : value
      ? 'motion-safe:animate-die-land'
      : 'motion-safe:animate-die-idle';

  return (
    <span
      aria-hidden="true"
      className={`grid size-11 grid-cols-3 grid-rows-3 place-items-center rounded-xl p-1.5 shadow-inner ring-1 ${
        value || rolling
          ? 'bg-white ring-gray-300'
          : 'border-2 border-dashed border-gray-200 bg-gray-50 ring-transparent'
      } ${motion}`}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <span
          key={cell}
          className={`size-2 rounded-full ${pips.includes(cell) ? 'bg-gray-900' : ''}`}
        />
      ))}
    </span>
  );
}

function Choice({
  title,
  detail,
  primary = false,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl px-4 py-3 text-left shadow-md transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${
        primary
          ? 'bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700'
          : 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50'
      }`}
    >
      <span className="text-base font-semibold">{title}</span>
      <span className={`text-xs ${primary ? 'text-emerald-50' : 'text-gray-500'}`}>{detail}</span>
    </button>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="motion-safe:animate-rise-in flex items-center gap-2 text-sm text-gray-600">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
      </span>
      {children}
    </p>
  );
}

function Decided({ headline }: { headline: string }) {
  return (
    <div className="motion-safe:animate-pop-in text-center">
      <p className="text-2xl font-bold text-emerald-700">{headline}</p>
      <p className="mt-1 text-sm text-gray-500">Drawing your opening hand…</p>
    </div>
  );
}
