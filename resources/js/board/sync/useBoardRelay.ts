import { useCallback, useEffect, useRef } from 'react';
import { GameState } from '../types';
import { compactState } from './persist';
import { redact } from './redact';
import { PublicState } from './types';
import { isStaleGame } from './reload';
import { postJson } from './useGameSync';

/** How long the board must sit still before it is saved. */
const SAVE_DEBOUNCE_MS = 1500;

/** How long before a game still refused as stale is reported again, in case the reload failed. */
export const STALE_RETRY_MS = 5000;

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
  matchNumber,
  gameNumber,
  relaying,
  saving,
  onStale,
}: {
  code: string;
  /** The match in progress. A rematch starts the game number over. */
  matchNumber?: number;
  /** The game in progress, which a board belongs to. */
  gameNumber: number;
  /** Off until the match is live. A board played alone is nobody else's business. */
  relaying: boolean;
  /** Off until the game is active, which is the same rule the endpoint enforces. */
  saving: boolean;
  /** The server refused a board for being from an earlier game: this page missed the game ending. */
  onStale: () => void;
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
  const latest = useRef<{
    state: GameState;
    publicState: PublicState;
    gameNumber: number;
  } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Refs, so a gate opening does not rebuild `publish` and cost the board a
  // render on every change to either.
  const relayingRef = useRef(relaying);
  relayingRef.current = relaying;
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const gameNumberRef = useRef(gameNumber);
  gameNumberRef.current = gameNumber;
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;
  // Once per game however many boards were in flight when it ended, and again
  // only if the page is still on that game a while later.
  const staleReported = useRef<{ game: number; at: number } | null>(null);

  const failed = useCallback((what: string, game: number, error: unknown) => {
    console.error(`failed to ${what} the board`, error);
    if (!isStaleGame(error)) return;

    const last = staleReported.current;
    if (last?.game === game && Date.now() - last.at < STALE_RETRY_MS) return;

    staleReported.current = { game, at: Date.now() };
    onStaleRef.current();
  }, []);

  const relay = useCallback(
    (publicState: PublicState, game: number) => {
      seq.current += 1;

      postJson(`/games/${code}/sync`, {
        match_number: matchNumber,
        game_number: game,
        session: session.current,
        seq: seq.current,
        state: publicState,
      }).catch((error) => failed('relay', game, error));
    },
    [code, matchNumber, failed]
  );

  const save = useCallback(() => {
    const current = latest.current;
    if (!current || !savingRef.current) return;

    // A save still pending when the game moves on is refused, not written over the next one.
    postJson(`/games/${code}/state`, {
      match_number: matchNumber,
      game_number: current.gameNumber,
      seq: seq.current,
      state: compactState(current.state),
      public_state: current.publicState,
    }).catch((error) => failed('save', current.gameNumber, error));
  }, [code, matchNumber, failed]);

  const publish = useCallback(
    (state: GameState) => {
      const publicState = redact(state);
      latest.current = { state, publicState, gameNumber: gameNumberRef.current };

      if (relayingRef.current) {
        relay(publicState, gameNumberRef.current);
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

    relay(latest.current.publicState, latest.current.gameNumber);
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
