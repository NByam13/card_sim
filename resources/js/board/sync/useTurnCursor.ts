import { advance as advanceRoute } from '@/actions/App/Http/Controllers/TurnCursorController';
import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CursorMove, drawsOnTurnStart, next, previous, startsTurn } from '../mlp/turnTrack';
import { Seat, TurnCursor, WireCursor } from './types';
import { postJson } from './useGameSync';

/**
 * The shared turn cursor, live: seeded from the show payload, moved by
 * `.turn.advanced` and by this seat's own presses.
 *
 * Moves go one at a time, and a press while one is in flight is dropped. The
 * endpoint is last-write-wins within a turn, so two moves racing each other can
 * land out of order and walk the cursor backwards.
 *
 * A refused move reloads the cursor prop, since it means this copy was stale.
 */
export function useTurnCursor({
  code,
  seat,
  cursor: served,
}: {
  code: string;
  seat: Seat;
  /** The cursor on the show payload. A new object means a fresh one from the server. */
  cursor: TurnCursor;
}): {
  cursor: TurnCursor;
  /** A cursor from the channel. */
  receive: (cursor: WireCursor) => void;
  /**
   * One press forward. `onTurnStart` runs once the server has accepted a move
   * that starts the turn, told whether that turn draws.
   */
  advance: (onTurnStart: (draw: boolean) => void) => void;
  stepBack: () => void;
} {
  const [cursor, setCursor] = useState(served);
  // Read by the callbacks, and written with the state so a press straight after
  // a response never reads the cursor before it.
  const latest = useRef(served);
  const inFlight = useRef(false);

  const apply = useCallback((next: TurnCursor) => {
    latest.current = next;
    setCursor(next);
  }, []);

  // A reload answered before a broadcast it arrives after is older than the cursor already held.
  useEffect(() => {
    if (served.turn_number < latest.current.turn_number) return;
    apply(served);
  }, [apply, served]);

  // The mover hears its own `.turn.advanced` too, and that echo can land after the response.
  const receive = useCallback(
    (wire: WireCursor) => {
      if (wire.turn_number < latest.current.turn_number) return;
      apply({ ...wire, my_turn: wire.active_seat === seat });
    },
    [apply, seat]
  );

  const send = useCallback(
    (move: CursorMove | null, onAccepted?: () => void) => {
      if (!move || inFlight.current) return;
      inFlight.current = true;

      postJson<{ cursor: WireCursor }>(advanceRoute.url(code), move)
        .then(({ cursor: moved }) => {
          receive(moved);
          onAccepted?.();
        })
        .catch((error) => {
          console.error('failed to move the turn cursor', error);
          router.reload({ only: ['cursor'] });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [code, receive]
  );

  const advance = useCallback(
    (onTurnStart: (draw: boolean) => void) => {
      const from = latest.current;
      const move = next(from);
      send(
        move,
        move && startsTurn(from, move) ? () => onTurnStart(drawsOnTurnStart(from)) : undefined
      );
    },
    [send]
  );

  const stepBack = useCallback(() => send(previous(latest.current)), [send]);

  return { cursor, receive, advance, stepBack };
}
