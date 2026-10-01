import Modal from '@/components/Modal';
import { GameStatus, MatchFormat, opposingSeat, Seat, WinReason } from '@/types/game';
import { GameFinishedPayload, GameResult } from '../sync/types';

/**
 * What the other seat did: the opponent conceded, or claimed the win. Null for
 * a result this seat caused itself.
 */
export function opponentsResult(seat: Seat, result: GameFinishedPayload): GameResult | null {
  const last = result.game_results.at(-1);
  if (!last) return null;

  const theyConceded = last.reason === WinReason.Concede && last.winner === seat;
  const theyClaimed = last.reason === WinReason.Story && last.winner === opposingSeat(seat);

  return theyConceded || theyClaimed ? last : null;
}

/** Tells a seat how the game it was playing just ended, when the other seat ended it. */
export default function GameFinishedModal({
  seat,
  opponentName,
  format,
  result,
  onClose,
}: {
  seat: Seat;
  opponentName: string;
  format: MatchFormat;
  result: GameFinishedPayload;
  onClose: () => void;
}) {
  const last = opponentsResult(seat, result);
  if (!last) return null;

  const youWon = last.winner === seat;
  const matchOver = result.status === GameStatus.Finished;
  const what =
    format === MatchFormat.Bo1 ? 'the game' : matchOver ? 'the match' : `game ${last.game}`;

  return (
    <Modal show onClose={onClose} maxWidth="sm" labelledBy="game-finished-title">
      <div className="space-y-3 bg-white p-5 text-center">
        <h2 id="game-finished-title" className="text-lg font-semibold">
          {last.reason === WinReason.Concede
            ? `${opponentName} conceded`
            : `${opponentName} claimed the win`}
        </h2>
        <p className="text-sm text-gray-600">
          {last.reason === WinReason.Story && 'Their Main Character reached Story Stage IV. '}
          {youWon ? `You win ${what}.` : `They take ${what}.`}
        </p>
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
}
