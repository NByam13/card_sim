import { concede as concedeRoute } from '@/actions/App/Http/Controllers/GameResultController';
import { useCallback, useEffect, useRef, useState } from 'react';
import { reloadIntoCurrentGame } from './reload';
import { postJson } from './useGameSync';

/** Conceding the game in progress, behind one confirmation. */
export function useConcede({
  code,
  matchNumber,
  gameNumber,
  beforeRecord,
  enabled,
}: {
  code: string;
  /** The match in progress. A rematch starts the game number over. */
  matchNumber?: number;
  /** Runs first, and is waited on: the board saved as it stands, since the result stops saves. */
  beforeRecord?: () => Promise<void>;
  /** The game being conceded. A concede for one already over is refused. */
  gameNumber: number;
  enabled: boolean;
}): {
  confirming: boolean;
  open: () => void;
  dismiss: () => void;
  concede: () => void;
  busy: boolean;
  error: string | null;
} {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Otherwise a confirmation the game ended under would reopen once the next game is undecided.
  useEffect(() => {
    if (!enabled) setConfirming(false);
  }, [enabled]);

  const open = useCallback(() => {
    setError(null);
    setConfirming(true);
  }, []);

  const dismiss = useCallback(() => setConfirming(false), []);

  const concede = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const record = () =>
      postJson(concedeRoute.url(code), { match_number: matchNumber, game_number: gameNumber });

    (beforeRecord ? beforeRecord().then(record) : record())
      .then(() => setConfirming(false))
      .catch((failure) => {
        console.error('failed to concede', failure);
        setError('The concede could not be recorded. The game may already be decided.');
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
        reloadIntoCurrentGame();
      });
  }, [code, matchNumber, gameNumber, beforeRecord]);

  return { confirming: enabled && confirming, open, dismiss, concede, busy, error };
}
