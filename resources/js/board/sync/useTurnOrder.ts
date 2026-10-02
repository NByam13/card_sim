import {
  elect as electRoute,
  roll as rollRoute,
} from '@/actions/App/Http/Controllers/TurnOrderController';
import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Seat } from '@/types/game';
import { TurnOrder, TurnOrderRoll } from './types';
import { postJson } from './useGameSync';

const sameDice = (a: number[], b: number[]) =>
  a.length === b.length && a.every((die, i) => die === b[i]);

const sameRoll = (a: TurnOrderRoll, b: TurnOrderRoll) =>
  a.winner === b.winner &&
  a.rerolls === b.rerolls &&
  sameDice(a.host, b.host) &&
  sameDice(a.guest, b.guest);

/**
 * Turn order, live: seeded from the show payload, then moved by this seat's own
 * roll and election and by `.turn_order.rolled` / `.turn_order.decided`.
 *
 * The sender hears its own broadcast as well as the response, so each result
 * arrives twice with the same stored value. Whichever lands first is applied and
 * the second is a no-op.
 *
 * The cursor on the page predates the decision, so the first time a decision
 * lands the `cursor` prop is reloaded.
 *
 * Each game of a Bo3 decides turn order afresh, so everything is ordered by game
 * first. Within a game the roll and the decision are written once, so a reload
 * answered before one of them arrived never takes it back.
 */
export function useTurnOrder({ code, turnOrder: served }: { code: string; turnOrder: TurnOrder }): {
  turnOrder: TurnOrder;
  receiveRoll: (roll: TurnOrderRoll) => void;
  receiveDecided: (firstPlayer: Seat, gameNumber: number) => void;
  roll: () => void;
  elect: (firstPlayer: Seat) => void;
} {
  const [turnOrder, setTurnOrder] = useState(served);
  const latest = useRef(served);
  const inFlight = useRef(false);

  const apply = useCallback((next: TurnOrder) => {
    latest.current = next;
    setTurnOrder(next);
  }, []);

  useEffect(() => {
    const held = latest.current;
    if (served.game_number < held.game_number) return;

    apply(
      served.game_number > held.game_number
        ? served
        : {
            ...served,
            roll: served.roll ?? held.roll,
            first_player: served.first_player ?? held.first_player,
            chooser: served.chooser ?? held.chooser,
          }
    );
  }, [apply, served]);

  // Only game 1 rolls, so a roll can only belong to it.
  const receiveRoll = useCallback(
    (roll: TurnOrderRoll) => {
      if (latest.current.game_number !== 1) return;
      const current = latest.current.roll;
      if (current && sameRoll(current, roll)) return;

      apply({ ...latest.current, roll, chooser: roll.winner });
    },
    [apply]
  );

  const receiveDecided = useCallback(
    (firstPlayer: Seat, gameNumber: number) => {
      const held = latest.current;
      if (gameNumber < held.game_number) return;
      if (gameNumber === held.game_number && held.first_player === firstPlayer) return;

      if (gameNumber > held.game_number) {
        // Decided for a game this page has not reloaded into yet.
        apply({ game_number: gameNumber, roll: null, first_player: firstPlayer, chooser: null });
        router.reload({ only: ['turnOrder', 'cursor'] });
        return;
      }

      apply({ ...held, first_player: firstPlayer });
      router.reload({ only: ['cursor'] });
    },
    [apply]
  );

  const send = useCallback(<T>(url: string, body: unknown, onDone: (response: T) => void) => {
    if (inFlight.current) return;
    inFlight.current = true;

    postJson<T>(url, body)
      .then(onDone)
      .catch((error) => {
        console.error('failed to settle turn order', error);
        router.reload({ only: ['turnOrder', 'cursor'] });
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  const roll = useCallback(
    () =>
      send<{ roll: TurnOrderRoll }>(rollRoute.url(code), {}, (response) =>
        receiveRoll(response.roll)
      ),
    [code, send, receiveRoll]
  );

  const elect = useCallback(
    (firstPlayer: Seat) =>
      send<{ first_player: Seat; game_number: number }>(
        electRoute.url(code),
        { first_player: firstPlayer },
        (response) => receiveDecided(response.first_player, response.game_number)
      ),
    [code, send, receiveDecided]
  );

  return { turnOrder, receiveRoll, receiveDecided, roll, elect };
}
