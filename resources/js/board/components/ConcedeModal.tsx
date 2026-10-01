import Modal from '@/components/Modal';
import { MatchFormat, opposingSeat, Seat } from '@/types/game';
import { MatchScore } from './WinClaimModal';

/** The one confirmation before a seat gives the game away. */
export default function ConcedeModal({
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
  const opponent = opposingSeat(seat);
  const losesMatch = score.wins[opponent] + 1 >= score.games_to_win;
  const after = { ...score.wins, [opponent]: score.wins[opponent] + 1 };

  return (
    <Modal show onClose={onClose} closeable={!busy} maxWidth="sm" labelledBy="concede-title">
      <div className="space-y-3 bg-white p-5 text-center">
        <h2 id="concede-title" className="text-lg font-semibold">
          {bo3 ? `Concede game ${score.game_number}?` : 'Concede the game?'}
        </h2>
        <p className="text-sm text-gray-600">
          {!bo3
            ? `${opponentName} is recorded as the winner.`
            : losesMatch
              ? `${opponentName} takes the game and the match.`
              : `${opponentName} takes game ${score.game_number}. The match goes on.`}
        </p>
        {bo3 && (
          <p className="text-xs text-gray-500 tabular-nums">
            The match would stand at {after[seat]}–{after[opponent]}.
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
            Keep playing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Conceding…' : 'Concede'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
