import { ReactNode } from 'react';
import { advanceLabel, stopLabel, stopsForTurn, trackTurn } from '../mlp/turnTrack';
import { Seat, TurnCursor, TurnOrder, TurnOrderRoll } from '../sync/types';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const BUTTON =
  'rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700';

const SECONDARY_BUTTON =
  'rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50';

const opposing = (seat: Seat): Seat => (seat === 'host' ? 'guest' : 'host');

/**
 * The strip between the two halves: turn order until it is decided, then the
 * turn number, whose turn it is and the stop the cursor is on.
 * A watcher gets the same bar with no actions.
 */
export default function SeamBar({
  seat,
  names,
  cursor,
  turnOrder,
  onRoll,
  onElect,
  onAdvance,
  waiting,
}: {
  /** Null for a watcher. */
  seat: Seat | null;
  names: Record<Seat, string>;
  cursor: TurnCursor;
  turnOrder: TurnOrder;
  onRoll?: () => void;
  onElect?: (firstPlayer: Seat) => void;
  onAdvance?: () => void;
  /** Why the turn cannot move yet, shown in place of the advance button. */
  waiting?: string;
}) {
  const nameOf = (which: Seat) => (which === seat ? 'You' : names[which]);
  const { roll, first_player } = turnOrder;

  if (!roll) {
    return (
      <Bar status="Turn order" action={seat && onRoll && <Button onClick={onRoll}>Roll</Button>}>
        <span className="text-gray-500">
          {seat ? 'Roll 2d6 each. The winner chooses who goes first.' : 'Waiting for the roll…'}
        </span>
      </Bar>
    );
  }

  if (!first_player) {
    const choosing = seat === roll.winner;

    return (
      <Bar
        status={choosing ? 'You won the roll' : `${nameOf(roll.winner)} won the roll`}
        action={
          choosing && onElect ? (
            <>
              <Button onClick={() => onElect(roll.winner)}>Go first</Button>
              <Button secondary onClick={() => onElect(opposing(roll.winner))}>
                Go second
              </Button>
            </>
          ) : (
            <span className="text-gray-500">Choosing who goes first…</span>
          )
        }
      >
        <Dice roll={roll} nameOf={nameOf} />
      </Bar>
    );
  }

  const acting = cursor.active_seat ?? first_player;
  const turnNumber = trackTurn(cursor);
  const label = onAdvance ? advanceLabel(cursor) : null;

  return (
    <Bar
      status={
        <>
          <span className="font-semibold text-gray-900">Turn {turnNumber}</span>
          <span className="text-gray-400"> · </span>
          <span className={acting === seat ? 'font-semibold text-emerald-700' : 'text-gray-700'}>
            {acting === seat ? 'Your turn' : `${names[acting]}’s turn`}
          </span>
        </>
      }
      action={
        label && onAdvance ? (
          <Button onClick={onAdvance}>{label}</Button>
        ) : (
          waiting && <span className="text-gray-500">{waiting}</span>
        )
      }
    >
      <ol aria-label="Turn stops" className="flex items-center gap-1">
        {stopsForTurn(turnNumber).map((stop) => {
          const current = stop === cursor.turn_stop;

          return (
            <li
              key={stop}
              aria-current={current ? 'step' : undefined}
              className={`rounded-full px-2 py-0.5 ${
                current ? 'bg-gray-900 font-semibold text-white' : 'text-gray-500'
              }`}
            >
              {stopLabel(stop)}
            </li>
          );
        })}
      </ol>
    </Bar>
  );
}

function Bar({
  status,
  action,
  children,
}: {
  status: ReactNode;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Turn"
      className="grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-gray-50 px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200"
    >
      <div className="truncate">{status}</div>
      <div>{children}</div>
      <div className="flex items-center justify-end gap-2">{action}</div>
    </section>
  );
}

function Button({
  onClick,
  secondary = false,
  children,
}: {
  onClick: () => void;
  secondary?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={secondary ? SECONDARY_BUTTON : BUTTON}>
      {children}
    </button>
  );
}

function Dice({ roll, nameOf }: { roll: TurnOrderRoll; nameOf: (seat: Seat) => string }) {
  return (
    <span className="flex items-center gap-3">
      {(['host', 'guest'] as Seat[]).map((which) => {
        const dice = roll[which];
        const total = dice.reduce((sum, die) => sum + die, 0);

        return (
          <span
            key={which}
            aria-label={`${nameOf(which)} rolled ${total}`}
            className={which === roll.winner ? 'font-semibold text-gray-900' : 'text-gray-500'}
          >
            {nameOf(which)}{' '}
            <span aria-hidden="true" className="text-base leading-none">
              {dice.map((die) => DIE_FACES[die - 1]).join('')}
            </span>{' '}
            {total}
          </span>
        );
      })}
      {roll.rerolls > 0 && (
        <span className="text-gray-400">
          after {roll.rerolls} {roll.rerolls === 1 ? 'tie' : 'ties'}
        </span>
      )}
    </span>
  );
}
