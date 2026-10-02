import Modal from '@/components/Modal';
import { MatchFormat, opposingSeat, Seat, WinReason } from '@/types/game';
import { GameResult } from '../sync/types';
import { Acceptance } from '../sync/useGameSync';
import { MatchScore } from './WinClaimModal';

export interface FinishedMatch extends MatchScore {
  game_results: GameResult[];
  winner_seat: Seat | null;
}

const PRIMARY =
  'rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700';

const LINK = 'text-sm font-medium text-gray-500 underline hover:text-gray-900';

/** "You" for this seat, the name for anyone else. A watcher holds no seat, so sees both names. */
const namer = (seat: Seat | null, names: Record<Seat, string>) => (which: Seat) =>
  which === seat ? 'You' : names[which];

/** Who won the match, and how each game within it ended. */
export function MatchSummary({
  seat,
  names,
  match,
}: {
  /** Null for a watcher. */
  seat: Seat | null;
  names: Record<Seat, string>;
  match: FinishedMatch;
}) {
  const nameOf = namer(seat, names);
  const winner = match.winner_seat;
  const bo3 = match.format === MatchFormat.Bo3;
  const left = seat ?? Seat.Host;

  return (
    <div className="space-y-3 text-center">
      {winner && (
        <h2 id="match-result-title" className="text-lg font-semibold">
          {nameOf(winner)} won the {bo3 ? 'match' : 'game'}
        </h2>
      )}
      {bo3 && (
        <p aria-label="Final score" className="text-2xl font-bold text-gray-900 tabular-nums">
          {match.wins[left]}–{match.wins[opposingSeat(left)]}
        </p>
      )}
      <ol className="space-y-1 text-sm text-gray-600">
        {match.game_results.map((result) => (
          <li key={result.game}>
            {bo3 && <span className="font-medium text-gray-900">Game {result.game}: </span>}
            {result.reason === WinReason.Concede
              ? `${nameOf(opposingSeat(result.winner))} conceded`
              : `${nameOf(result.winner)} reached Story Stage IV`}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Asking for a rematch, or answering one. */
function Rematch({
  seat,
  opponentName,
  accepted,
  onRematch,
}: {
  seat: Seat;
  opponentName: string;
  accepted: Acceptance;
  onRematch: () => void;
}) {
  if (accepted[seat]) {
    return (
      <p className="text-sm text-gray-500">
        Waiting for <span className="font-medium text-gray-700">{opponentName}</span> to accept the
        rematch&hellip;
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {accepted[opposingSeat(seat)] ? `${opponentName} wants a rematch. ` : ''}Same decks, fresh
        hands.
      </p>
      <button type="button" onClick={onRematch} className={PRIMARY}>
        {accepted[opposingSeat(seat)] ? 'Accept the rematch' : 'Rematch'}
      </button>
    </div>
  );
}

/**
 * The match is over: who won, the games within it, and the offer to play again.
 * Closing it leaves the final position on the table to look at.
 */
export default function MatchResultModal({
  seat,
  names,
  match,
  accepted,
  onRematch,
  onClose,
}: {
  seat: Seat;
  names: Record<Seat, string>;
  match: FinishedMatch;
  accepted: Acceptance;
  onRematch: () => void;
  onClose: () => void;
}) {
  return (
    <Modal show onClose={onClose} maxWidth="sm" labelledBy="match-result-title">
      <div className="space-y-4 bg-white p-5 text-center">
        <MatchSummary seat={seat} names={names} match={match} />
        <Rematch
          seat={seat}
          opponentName={names[opposingSeat(seat)]}
          accepted={accepted}
          onRematch={onRematch}
        />
        <button type="button" onClick={onClose} className={LINK}>
          Look at the board
        </button>
      </div>
    </Modal>
  );
}

/** Where the seam bar was, once the match is over: the result in a line, and the way back to it. */
export function MatchOverBar({
  seat,
  names,
  match,
  accepted,
  onResults,
}: {
  seat: Seat;
  names: Record<Seat, string>;
  match: FinishedMatch;
  accepted: Acceptance;
  onResults: () => void;
}) {
  const winner = match.winner_seat;
  const opponent = opposingSeat(seat);
  const rematch = accepted[seat]
    ? `Waiting for ${names[opponent]} to accept the rematch`
    : accepted[opponent]
      ? `${names[opponent]} wants a rematch`
      : null;

  return (
    <section
      aria-label="Match over"
      className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-1 text-xs"
    >
      <span className="flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
          Match over
        </span>
        {winner && (
          <span className="font-medium text-gray-700">
            {namer(seat, names)(winner)} won
            {match.format === MatchFormat.Bo3 && ` ${match.wins[seat]}–${match.wins[opponent]}`}
          </span>
        )}
      </span>
      <span className="flex items-center gap-3">
        {rematch && <span className="text-gray-500">{rematch}</span>}
        <button
          type="button"
          onClick={onResults}
          className="rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          {accepted[seat] ? 'Results' : 'Results & rematch'}
        </button>
      </span>
    </section>
  );
}
