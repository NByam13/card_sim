import { concede as concedeRoute } from '@/actions/App/Http/Controllers/GameResultController';
import { useCallback, useEffect, useRef, useState } from 'react';
import { reloadIntoCurrentGame } from './reload';
import { postJson } from './useGameSync';

/** Conceding the game in progress, behind one confirmation. */
export function useConcede({
  code,
  gameNumber,
  enabled,
}: {
  code: string;
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

    postJson(concedeRoute.url(code), { game_number: gameNumber })
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
  }, [code, gameNumber]);

  return { confirming: enabled && confirming, open, dismiss, concede, busy, error };
}
