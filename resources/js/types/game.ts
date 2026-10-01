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
