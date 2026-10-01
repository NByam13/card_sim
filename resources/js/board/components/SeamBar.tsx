import { Fragment, ReactNode } from 'react';
import { advanceLabel, displayStops, trackTurn } from '../mlp/turnTrack';
import { MatchFormat, opposingSeat, Seat } from '@/types/game';
import { TurnCursor, TurnOrder } from '../sync/types';
import { MatchScore } from './WinClaimModal';

const BUTTON =
  'rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700';

const CAPTION = 'text-[10px] font-semibold tracking-wide whitespace-nowrap text-gray-500 uppercase';

const AWAY =
  'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase';

const STOP_BASE = 'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase';
const STOP_CURRENT = `${STOP_BASE} bg-emerald-600 text-white shadow-sm`;
const STOP_SPENT = `${STOP_BASE} text-gray-400`;
const STOP_AHEAD = `${STOP_BASE} text-gray-600`;
const STOP_LOCKED = `${STOP_BASE} text-gray-300`;

/**
 * The strip between the two halves: the turn number, whose turn it is and the
 * stop the cursor is on. Turn order itself is decided in `TurnOrderModal`.
 * A watcher gets the same bar with no actions.
 *
 * Ported from PonyRec's seam and `PhaseIndicator`. The left cell carries a
 * Bo3's score and which seats presence has seen leave; the clocks will join it.
 */
export default function SeamBar({
  seat,
  names,
  cursor,
  turnOrder,
  onAdvance,
  waiting,
  away = [],
  score,
  onClaimWin,
}: {
  /** Null for a watcher. */
  seat: Seat | null;
  names: Record<Seat, string>;
  cursor: TurnCursor;
  turnOrder: TurnOrder;
  onAdvance?: () => void;
  /** Why the turn cannot move yet, shown in place of the advance button. */
  waiting?: string;
  /** Seats whose browser has left the channel. Their mirror is frozen, not thinking. */
  away?: Seat[];
  score?: MatchScore;
  /** Reopens the Stage IV claim, while this seat's Main Character stands there. */
  onClaimWin?: () => void;
}) {
  const nameOf = (which: Seat) => (which === seat ? 'You' : names[which]);
  const { first_player } = turnOrder;
  const presence = (
    <>
      {score?.format === MatchFormat.Bo3 && <Score score={score} seat={seat} nameOf={nameOf} />}
      <Away seats={away} names={names} />
    </>
  );

  if (!first_player) {
    return (
      <Bar presence={presence} caption="Turn order" action={null}>
        <span className="px-2 text-gray-500">Deciding who goes first…</span>
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
        <>
          {onClaimWin && <Button onClick={onClaimWin}>Claim win</Button>}
          {label && onAdvance ? (
            <Button onClick={onAdvance}>{label}</Button>
          ) : (
            waiting && <Note>{waiting}</Note>
          )}
        </>
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

function Score({
  score,
  seat,
  nameOf,
}: {
  score: MatchScore;
  seat: Seat | null;
  nameOf: (which: Seat) => string;
}) {
  const left = seat ?? Seat.Host;
  const right = opposingSeat(left);

  return (
    <span aria-label="Score" className="flex items-center gap-1.5 text-gray-700">
      <span className="font-medium">
        {nameOf(left)} {score.wins[left]}–{score.wins[right]} {nameOf(right)}
      </span>
      <span className={CAPTION}>First to {score.games_to_win}</span>
    </span>
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

function Button({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={BUTTON}>
      {children}
    </button>
  );
}
