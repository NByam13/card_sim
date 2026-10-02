import { Card } from '@/types/cards';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldAcceptFrame } from './acceptFrame';
import { hydrateMirror, MirrorState, unresolvedNumbers } from './hydrate';
import { FrameCursor, PublicState, StateFrame } from './types';

/** Resolves a card number to its card, or null when it cannot be resolved. */
export type CardLookup = (cardNumber: string) => Promise<Card | null>;

/**
 * The opponent's half of the table, rebuilt from the frames they relay.
 *
 * Ported from PonyRec's `useOpponentMirror`. Where a card comes from is injected
 * rather than reached for: the detect-resolve-cache loop is generic, and this is
 * the seam the setup module will own.
 *
 * @see documentation/board-sync/spec.md
 */
export function useMirror(
  lookup: CardLookup,
  initial?: PublicState | null,
  /** The game `initial` was saved in. */
  gameNumber = 1
): {
  mirror: MirrorState | null;
  receive: (frame: StateFrame) => void;
} {
  const [state, setState] = useState<PublicState | null>(initial ?? null);
  const [cards, setCards] = useState<ReadonlyMap<string, Card>>(new Map());
  const cursor = useRef<FrameCursor>({ game_number: gameNumber, session: null, seq: 0 });
  // Numbers already asked for, so a card being in flight does not start a second
  // request on every frame that arrives meanwhile.
  const pending = useRef(new Set<string>());

  const receive = useCallback((frame: StateFrame) => {
    if (!shouldAcceptFrame(cursor.current, frame)) return;

    cursor.current = { game_number: frame.game_number, session: frame.session, seq: frame.seq };
    setState(frame.state);
  }, []);

  // A fresh server snapshot replaces the mirror and resets ordering: it may lag
  // the live frames by a save debounce, and the next frame corrects it. A null
  // snapshot clears it rather than leaving the last one standing — the server
  // having no board for that seat is an answer, not a missing one. Except where
  // it is older news: a snapshot for an earlier game than the frames already
  // here, or an empty one for a game whose new deal has already arrived.
  useEffect(() => {
    const held = cursor.current;
    if (held.game_number > gameNumber) return;
    if (initial == null && held.game_number === gameNumber && held.session !== null) return;

    cursor.current = { game_number: gameNumber, session: null, seq: 0 };
    setState(initial ?? null);
  }, [initial, gameNumber]);

  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!state) return;

    const missing = unresolvedNumbers(state, cards).filter(
      (number) => !pending.current.has(number)
    );
    if (missing.length === 0) return;

    missing.forEach((number) => pending.current.add(number));

    // Not cancelled when the state moves on: a card is keyed by its number, and
    // the next run skips everything still pending, so a discarded answer is never
    // asked for again.
    Promise.all(
      missing.map((number) =>
        lookupRef
          .current(number)
          .then((card) => [number, card] as const)
          .catch(() => [number, null] as const)
      )
    ).then((results) => {
      // Clearing `pending` either way lets the next frame retry what failed.
      results.forEach(([number]) => pending.current.delete(number));
      if (!mounted.current) return;

      const found = results.filter((entry): entry is [string, Card] => entry[1] !== null);
      if (found.length === 0) return;

      setCards((current) => {
        const next = new Map(current);
        found.forEach(([number, card]) => next.set(number, card));
        return next;
      });
    });
  }, [state, cards]);

  const mirror = useMemo(() => (state ? hydrateMirror(state, cards) : null), [state, cards]);

  return { mirror, receive };
}
