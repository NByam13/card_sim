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
  relaying,
  saving,
}: {
  code: string;
  /** Off until the match is live. A board played alone is nobody else's business. */
  relaying: boolean;
  /** Off until the game is active, which is the same rule the endpoint enforces. */
  saving: boolean;
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
  // Refs, so a gate opening does not rebuild `publish` and cost the board a
  // render on every change to either.
  const relayingRef = useRef(relaying);
  relayingRef.current = relaying;
  const savingRef = useRef(saving);
  savingRef.current = saving;

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
    if (!current || !savingRef.current) return;

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

      if (relayingRef.current) {
        relay(publicState);
      }

      if (savingRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
      }
    },
    [relay, save]
  );

  const announce = useCallback(() => {
    if (!relayingRef.current || !latest.current) return;

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
