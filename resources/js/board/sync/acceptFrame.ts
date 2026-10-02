import { FrameCursor, StateFrame } from './types';

/**
 * Whether a mirror should apply this frame, or has already moved past it.
 *
 * Frames ride separate requests and can overtake each other, which is safe
 * because each one is a whole state rather than a delta.
 *
 * A new `session` always wins: the sender remounted and its `seq` restarted from
 * zero, so comparing would freeze the mirror until the counter caught up. A new
 * game outranks both, and a frame from an earlier game is never taken.
 *
 * Ported from PonyRec's `multiplayer/acceptFrame.ts`.
 */
export function shouldAcceptFrame(cursor: FrameCursor | null, incoming: StateFrame): boolean {
  if (cursor === null) return true;
  if (incoming.game_number !== cursor.game_number) return incoming.game_number > cursor.game_number;
  if (cursor.session !== incoming.session) return true;

  return incoming.seq > cursor.seq;
}
