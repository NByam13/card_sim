import Modal from '@/components/Modal';
import { MatchFormat, opposingSeat, Seat } from '@/types/game';

export interface MatchScore {
  format: MatchFormat;
  game_number: number;
  games_to_win: number;
  wins: Record<Seat, number>;
}

/**
 * Opens when your Main Character lands on Story Stage IV: congratulates, says
 * what confirming records, and leaves "Not yet" as the way out.
 */
export default function WinClaimModal({
  seat,
  opponentName,
  score,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  seat: Seat;
  opponentName: string;
  score: MatchScore;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const bo3 = score.format === MatchFormat.Bo3;
  const winsMatch = score.wins[seat] + 1 >= score.games_to_win;
  const heading = winsMatch
    ? `That wins you the ${bo3 ? 'match' : 'game'}`
    : `That wins you game ${score.game_number}`;
  const after = { ...score.wins, [seat]: score.wins[seat] + 1 };

  return (
    <Modal show onClose={onClose} closeable={!busy} maxWidth="sm" labelledBy="win-claim-title">
      <div className="space-y-3 bg-white p-5 text-center">
        <p className="text-2xl font-bold text-emerald-600">Stage IV!</p>
        <h2 id="win-claim-title" className="text-lg font-semibold">
          {heading}
        </h2>
        <p className="text-sm text-gray-600">
          Your Main Character reached Story Stage IV. Confirming records the win
          {winsMatch
            ? ` and ends the ${bo3 ? 'match' : 'game'} as a loss for ${opponentName}.`
            : ` and gives ${opponentName} the loss for game ${score.game_number}.`}
        </p>
        {bo3 && (
          <p className="text-xs text-gray-500 tabular-nums">
            The match would stand at {after[seat]}–{after[opposingSeat(seat)]}.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-sm font-medium text-gray-500 underline hover:text-gray-900 disabled:opacity-50"
          >
            Not yet
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? 'Confirming…' : 'Confirm the win'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
