import { claim as claimRoute } from '@/actions/App/Http/Controllers/GameResultController';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mainCharacterOnFinalStage } from '../mlp/victory';
import { GameState } from '../types';
import { reloadIntoCurrentGame } from './reload';
import { postJson } from './useGameSync';

/**
 * The Stage IV win claim: watches this seat's board and prompts once on the move
 * onto the stage, not on every state that has it there.
 *
 * Seeded from the board the arena will restore, so a reload with the Main
 * Character already on Stage IV does not count as arriving. `claimable` keeps the
 * claim on offer after the prompt is dismissed.
 */
export function useWinClaim({
  code,
  gameNumber,
  restoring,
  enabled,
}: {
  code: string;
  /** The game being claimed. A claim for one already over is refused. */
  gameNumber: number;
  /** The board the arena mounts with, or null for a fresh deal. */
  restoring: GameState | null;
  /** Whether a claim could be accepted now: a live match, with this game undecided. */
  enabled: boolean;
}): {
  watch: (state: GameState) => void;
  claimable: boolean;
  prompting: boolean;
  open: () => void;
  dismiss: () => void;
  claim: () => void;
  busy: boolean;
  error: string | null;
} {
  const [onFinalStage, setOnFinalStage] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOnFinalStage = useRef(restoring !== null && mainCharacterOnFinalStage(restoring));
  const inFlight = useRef(false);
  // Read by `watch`, so an arrival while disabled is not held over to pop up once enabled.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Otherwise a prompt the game ended under would reopen once the next game is undecided.
  useEffect(() => {
    if (!enabled) setPrompting(false);
  }, [enabled]);

  const watch = useCallback((state: GameState) => {
    const now = mainCharacterOnFinalStage(state);
    setOnFinalStage(now);
    if (now && !wasOnFinalStage.current && enabledRef.current) {
      setError(null);
      setPrompting(true);
    }
    wasOnFinalStage.current = now;
  }, []);

  const open = useCallback(() => {
    setError(null);
    setPrompting(true);
  }, []);

  const dismiss = useCallback(() => setPrompting(false), []);

  const claim = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);

    postJson(claimRoute.url(code), { game_number: gameNumber })
      .then(() => setPrompting(false))
      .catch((failure) => {
        console.error('failed to claim the win', failure);
        setError('The win could not be recorded. The game may already be decided.');
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
        reloadIntoCurrentGame();
      });
  }, [code, gameNumber]);

  return {
    watch,
    claimable: enabled && onFinalStage,
    prompting: enabled && prompting,
    open,
    dismiss,
    claim,
    busy,
    error,
  };
}
