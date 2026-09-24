import { useCallback, useEffect, useRef } from 'react';
import { GameState } from '../types';
import { compactState } from './persist';
import { redact } from './redact';
import { PublicState } from './types';
import { postJson } from './useGameSync';

/** How long the board must sit still before it is saved. */
const SAVE_DEBOUNCE_MS = 1500;

/**
 * This seat's board leaving the browser: relayed on every change, saved once it
 * settles.
 *
 * Splitting the two is what keeps a database write off every drag while still
 * letting a refresh resume. See the spec.
 *
 * @see documentation/board-sync/spec.md
 */
export function useBoardRelay({
  code,
  enabled,
}: {
  code: string;
  /** Off until there is somebody to relay to, and for a watcher, who has no board. */
  enabled: boolean;
}): {
  /** Called with every new board state. */
  publish: (state: GameState) => void;
  /** Re-send the last board, for someone who just arrived blank. */
  announce: () => void;
} {
  // One session per mount. A remount restarts `seq`, and a mirror takes a new
  // session's frames whatever their sequence — see `shouldAcceptFrame`.
  const session = useRef(crypto.randomUUID());
  const seq = useRef(0);
  const latest = useRef<{ state: GameState; publicState: PublicState } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const relay = useCallback(
    (publicState: PublicState) => {
      seq.current += 1;

      postJson(`/games/${code}/sync`, {
        session: session.current,
        seq: seq.current,
        state: publicState,
      }).catch((error) => console.error('failed to relay the board', error));
    },
    [code]
  );

  const save = useCallback(() => {
    const current = latest.current;
    if (!current) return;

    postJson(`/games/${code}/state`, {
      seq: seq.current,
      state: compactState(current.state),
      public_state: current.publicState,
    }).catch((error) => console.error('failed to save the board', error));
  }, [code]);

  const publish = useCallback(
    (state: GameState) => {
      const publicState = redact(state);
      latest.current = { state, publicState };

      if (!enabledRef.current) return;

      relay(publicState);

      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    },
    [relay, save]
  );

  const announce = useCallback(() => {
    if (!enabledRef.current || !latest.current) return;

    relay(latest.current.publicState);
  }, [relay]);

  // A board left mid-move would otherwise lose everything since the last save.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      save();
    },
    [save]
  );

  return { publish, announce };
}
