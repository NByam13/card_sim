/** Where a game is in its lifecycle. Mirrors `app/Enums/GameStatus.php`; keep the two in step. */
export const GameStatus = {
  Waiting: 'waiting',
  Active: 'active',
  Finished: 'finished',
} as const;

export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

/** One of a game's two seats. Mirrors `app/Enums/Seat.php`; keep the two in step. */
export const Seat = {
  Host: 'host',
  Guest: 'guest',
} as const;

export type Seat = (typeof Seat)[keyof typeof Seat];

export const opposingSeat = (seat: Seat): Seat => (seat === Seat.Host ? Seat.Guest : Seat.Host);

/** The presence role of someone without a seat. Mirrors `GameChannel::SPECTATOR_ROLE`; keep the two in step. */
export const SPECTATOR_ROLE = 'spectator';

/** Who a channel member is: a seat, or watching. */
export type Role = Seat | typeof SPECTATOR_ROLE;

/** How many games a match is played over. Mirrors `app/Enums/MatchFormat.php`; keep the two in step. */
export const MatchFormat = {
  Bo1: 'bo1',
  Bo3: 'bo3',
} as const;

export type MatchFormat = (typeof MatchFormat)[keyof typeof MatchFormat];

/** How a game was won. Mirrors `app/Enums/WinReason.php`; keep the two in step. */
export const WinReason = {
  Story: 'story',
  Concede: 'concede',
} as const;

export type WinReason = (typeof WinReason)[keyof typeof WinReason];
