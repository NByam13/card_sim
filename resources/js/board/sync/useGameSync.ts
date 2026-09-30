import { http } from '@inertiajs/react';
import { useEchoPresence } from '@laravel/echo-react';
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/types/cards';
import { Seat, StateFrame, WireCursor } from './types';

interface Member {
  id: string;
  role: Seat | 'spectator';
  name: string | null;
}

interface RelayedFrame extends StateFrame {
  seat: Seat;
}

/** Who is ready to play whom, as the server last recorded it. */
export type Acceptance = Record<Seat, boolean>;

/**
 * The game's live channel while a board is on screen: who is here, and the
 * opponent's frames as they arrive.
 *
 * Nothing listens for Echo client events, and nothing may start. Reverb cannot
 * say who sent one and accepts them from connections that never subscribed to
 * the channel, so not listening is what makes an injected event inert — the
 * lesson PON-42 taught PonyRec.
 *
 * This is the page's one subscription while playing. Channels are
 * reference-counted, so a second one alongside it would keep the first alive
 * across a remount and the seat would never be re-authorized.
 *
 * @see documentation/board-sync/spec.md
 */
export function useGameSync({
  code,
  seat,
  onFrame,
  onAnnounce,
  onSeatClaimed,
  onAccepted,
  onTurnAdvanced,
}: {
  code: string;
  seat: Seat;
  /** A frame from the other seat. Never one of your own — the relay is `toOthers`. */
  onFrame: (frame: StateFrame) => void;
  /** Someone arrived, or we (re)subscribed: send a frame so they are not blank. */
  onAnnounce: () => void;
  /** The other seat was taken while this board was on screen. */
  onSeatClaimed: () => void;
  /** A seat accepted the match. Carries both answers, not just the sender's. */
  onAccepted: (accepted: Acceptance) => void;
  /** The shared turn cursor moved, by either seat. */
  onTurnAdvanced: (cursor: WireCursor) => void;
}): { opponentPresent: boolean; watching: number } {
  const [opponentPresent, setOpponentPresent] = useState(false);
  const [watching, setWatching] = useState(0);

  // Handlers ride a ref so a new closure does not tear the subscription down.
  const handlers = useRef({ onFrame, onAnnounce, onSeatClaimed, onAccepted, onTurnAdvanced });
  handlers.current = { onFrame, onAnnounce, onSeatClaimed, onAccepted, onTurnAdvanced };

  const { channel } = useEchoPresence(`game.${code}`, [], () => {});

  useEffect(() => {
    const presence = channel();
    if (!presence) return;

    const isOpponent = (member: Member) => member.role !== 'spectator' && member.role !== seat;

    presence
      .here((members: Member[]) => {
        setOpponentPresent(members.some(isOpponent));
        setWatching(members.filter((m) => m.role === 'spectator').length);
        handlers.current.onAnnounce();
      })
      .joining((member: Member) => {
        if (isOpponent(member)) setOpponentPresent(true);
        else if (member.role === 'spectator') setWatching((count) => count + 1);

        // Whoever just arrived starts blank, so everyone re-announces.
        handlers.current.onAnnounce();
      })
      .leaving((member: Member) => {
        if (isOpponent(member)) setOpponentPresent(false);
        else if (member.role === 'spectator') setWatching((count) => Math.max(0, count - 1));
      })
      .listen('.board.state', ({ seat: from, ...frame }: RelayedFrame) => {
        if (from === seat) return;
        handlers.current.onFrame(frame);
      })
      // A seat taken while a board is already on screen. Presence says someone
      // arrived; only this says they arrived as a player.
      .listen('.seat.claimed', () => handlers.current.onSeatClaimed())
      .listen('.match.accepted', ({ accepted }: { accepted: Acceptance }) =>
        handlers.current.onAccepted(accepted)
      )
      .listen('.turn.advanced', ({ cursor }: { cursor: WireCursor }) =>
        handlers.current.onTurnAdvanced(cursor)
      )
      .error((error: unknown) => console.error('game channel subscription failed', error));
  }, [channel, seat]);

  return { opponentPresent, watching };
}

/**
 * POST through Inertia's own XHR client, which carries the `XSRF-TOKEN` cookie
 * as the header Laravel expects. A bare `fetch` would need that wired by hand,
 * and Inertia's docs ask for no `csrf-token` meta tag to read it from.
 */
export async function postJson<T = unknown>(url: string, data: unknown): Promise<T> {
  const response = await http.getClient().request({
    method: 'post',
    url,
    data,
    headers: { Accept: 'application/json' },
  });

  if (typeof response.data !== 'string') return response.data as T;

  // An empty body (a 204, say) is a success with nothing in it, not a parse error.
  return (response.data.trim() === '' ? undefined : JSON.parse(response.data)) as T;
}

/** Resolve a card through this app's cached proxy. Null when it cannot be. */
export async function lookupCard(cardNumber: string): Promise<Card | null> {
  try {
    const response = await http.getClient().request({
      method: 'get',
      url: `/cards/${encodeURIComponent(cardNumber)}`,
      headers: { Accept: 'application/json' },
    });

    return typeof response.data === 'string' ? JSON.parse(response.data) : (response.data as Card);
  } catch {
    return null;
  }
}
