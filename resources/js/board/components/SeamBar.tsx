import { Fragment, ReactNode } from 'react';
import { advanceLabel, displayStops, trackTurn } from '../mlp/turnTrack';
import { Seat, TurnCursor, TurnOrder, TurnOrderRoll } from '../sync/types';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const BUTTON =
  'rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700';

const SECONDARY_BUTTON =
  'rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50';

const CAPTION = 'text-[10px] font-semibold tracking-wide whitespace-nowrap text-gray-500 uppercase';

const AWAY =
  'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase';

const STOP_BASE = 'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase';
const STOP_CURRENT = `${STOP_BASE} bg-emerald-600 text-white shadow-sm`;
const STOP_SPENT = `${STOP_BASE} text-gray-400`;
const STOP_AHEAD = `${STOP_BASE} text-gray-600`;
const STOP_LOCKED = `${STOP_BASE} text-gray-300`;

const opposing = (seat: Seat): Seat => (seat === 'host' ? 'guest' : 'host');

/**
 * The strip between the two halves: turn order until it is decided, then the
 * turn number, whose turn it is and the stop the cursor is on.
 * A watcher gets the same bar with no actions.
 *
 * Ported from PonyRec's seam and `PhaseIndicator`. The left cell says which
 * seats presence has seen leave; the clocks will join it.
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
  away = [],
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
  /** Seats whose browser has left the channel. Their mirror is frozen, not thinking. */
  away?: Seat[];
}) {
  const nameOf = (which: Seat) => (which === seat ? 'You' : names[which]);
  const { roll, first_player } = turnOrder;
  const presence = <Away seats={away} names={names} />;

  if (!roll) {
    return (
      <Bar
        presence={presence}
        caption="Turn order"
        action={seat && onRoll ? <Button onClick={onRoll}>Roll</Button> : null}
      >
        <span className="px-2 text-gray-500">
          {seat ? 'Roll 2d6 each · the winner chooses who goes first' : 'Waiting for the roll…'}
        </span>
      </Bar>
    );
  }

  if (!first_player) {
    const choosing = seat === roll.winner;

    return (
      <Bar
        presence={presence}
        caption={`${nameOf(roll.winner)} won the roll`}
        action={
          choosing && onElect ? (
            <>
              <Button onClick={() => onElect(roll.winner)}>Go first</Button>
              <Button secondary onClick={() => onElect(opposing(roll.winner))}>
                Go second
              </Button>
            </>
          ) : (
            <Note>Choosing who goes first…</Note>
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
  const stops = displayStops(turnNumber, cursor.turn_stop);
  const currentIndex = stops.findIndex((stop) => stop.key === (cursor.turn_stop ?? 'start'));

  return (
    <Bar
      presence={presence}
      caption={`Turn ${turnNumber} · ${nameOf(acting)}`}
      action={
        label && onAdvance ? (
          <Button onClick={onAdvance}>{label}</Button>
        ) : (
          waiting && <Note>{waiting}</Note>
        )
      }
    >
      <ol aria-label="Turn stops" className="flex items-center">
        {stops.map((stop, index) => {
          const className =
            index === currentIndex
              ? STOP_CURRENT
              : stop.locked
                ? STOP_LOCKED
                : index < currentIndex
                  ? STOP_SPENT
                  : STOP_AHEAD;

          return (
            <Fragment key={stop.key}>
              {index > 0 && (
                <li aria-hidden className="px-0.5 text-[9px] text-gray-300">
                  ›
                </li>
              )}
              <li aria-current={index === currentIndex ? 'step' : undefined} className={className}>
                {stop.label}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </Bar>
  );
}

function Bar({
  presence,
  caption,
  action,
  children,
}: {
  presence: ReactNode;
  caption: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Turn"
      className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-slate-100 px-3 py-1 text-xs"
    >
      <div className="flex items-center gap-2">{presence}</div>
      <div className="flex items-center gap-2">
        <span className={CAPTION}>{caption}</span>
        <div className="flex items-center rounded-full bg-white/70 px-1 py-0.5 ring-1 ring-gray-200">
          {children}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">{action}</div>
    </section>
  );
}

function Away({ seats, names }: { seats: Seat[]; names: Record<Seat, string> }) {
  return seats.map((which) => (
    <span key={which} className="flex items-center gap-1.5 text-gray-700">
      <span className="font-medium">{names[which]}</span>
      <span className={AWAY}>Away</span>
    </span>
  ));
}

function Note({ children }: { children: ReactNode }) {
  return <span className={CAPTION}>{children}</span>;
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
    <span className="flex items-center gap-3 px-2">
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
