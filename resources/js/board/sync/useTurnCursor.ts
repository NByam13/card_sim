import { advance as advanceRoute } from '@/actions/App/Http/Controllers/TurnCursorController';
import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CursorMove,
  drawsOnTurnStart,
  next,
  previous,
  startsTurn,
  trackTurn,
} from '../mlp/turnTrack';
import { Seat, TurnCursor, WireCursor } from './types';
import { postJson } from './useGameSync';

/** A press's turn start, for the turn it opens. */
interface TurnStart {
  turn: number;
  run: () => void;
}

/**
 * The shared turn cursor, live: seeded from the show payload, moved by
 * `.turn.advanced` and by this seat's own presses.
 *
 * Moves go one at a time, and a press while one is in flight is dropped. The
 * endpoint is last-write-wins within a turn, so two moves racing each other can
 * land out of order and walk the cursor backwards.
 *
 * A refused move reloads the cursor prop, since it means this copy was stale.
 * A failed move can still have committed, so a turn start it carried is held
 * until the reload or the echo says whether the turn began.
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
   * that starts the turn, or the cursor shows a failed one committed anyway,
   * told whether that turn draws.
   */
  advance: (onTurnStart: (draw: boolean) => void) => void;
  stepBack: () => void;
} {
  const [cursor, setCursor] = useState(served);
  // Read by the callbacks, and written with the state so a press straight after
  // a response never reads the cursor before it.
  const latest = useRef(served);
  const inFlight = useRef(false);
  // Every path to a turn start goes through `start`, which runs each turn's once.
  const startedTurn = useRef<number | null>(null);
  const held = useRef<TurnStart | null>(null);

  const start = useCallback((turnStart: TurnStart) => {
    held.current = null;
    if (startedTurn.current === turnStart.turn) return;
    startedTurn.current = turnStart.turn;
    turnStart.run();
  }, []);

  /** `final` when the cursor is the server's answer after the failure, so an unmoved one means refused. */
  const settleHeld = useCallback(
    (cursor: TurnCursor, final: boolean) => {
      const turnStart = held.current;
      if (!turnStart) return;

      const sameTurn = cursor.turn_number === turnStart.turn && cursor.my_turn;
      if (sameTurn && cursor.turn_stop !== null) {
        start(turnStart);
      } else if (!sameTurn || final) {
        held.current = null;
      }
    },
    [start]
  );

  const apply = useCallback(
    (next: TurnCursor, final: boolean) => {
      latest.current = next;
      setCursor(next);
      settleHeld(next, final);
    },
    [settleHeld]
  );

  // A reload answered before a broadcast it arrives after is older than the cursor already held.
  useEffect(() => {
    if (served.turn_number < latest.current.turn_number) return;
    apply(served, true);
  }, [apply, served]);

  // The mover hears its own `.turn.advanced` too, and that echo can land after the response.
  const receive = useCallback(
    (wire: WireCursor) => {
      if (wire.turn_number < latest.current.turn_number) return;
      apply({ ...wire, my_turn: wire.active_seat === seat }, false);
    },
    [apply, seat]
  );

  const send = useCallback(
    (move: CursorMove | null, turnStart?: TurnStart) => {
      if (!move || inFlight.current) return;
      inFlight.current = true;
      held.current = null;

      postJson<{ cursor: WireCursor }>(advanceRoute.url(code), move)
        .then(({ cursor: moved }) => {
          receive(moved);
          if (turnStart) start(turnStart);
        })
        .catch((error) => {
          console.error('failed to move the turn cursor', error);
          if (turnStart) {
            held.current = turnStart;
            // The echo may have landed while the request was in flight.
            settleHeld(latest.current, false);
          }
          router.reload({ only: ['cursor'] });
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [code, receive, settleHeld, start]
  );

  const advance = useCallback(
    (onTurnStart: (draw: boolean) => void) => {
      const from = latest.current;
      const move = next(from);
      send(
        move,
        move && startsTurn(from, move)
          ? { turn: trackTurn(from), run: () => onTurnStart(drawsOnTurnStart(from)) }
          : undefined
      );
    },
    [send]
  );

  const stepBack = useCallback(() => send(previous(latest.current)), [send]);

  return { cursor, receive, advance, stepBack };
}
